import { Router } from "express";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { ensureDatabase, isDatabaseReady } from "../config/database.js";
import { AppError } from "../utils/errors.js";
import { listUserWorkspaces, resolveAuthenticatedContext } from "../services/auth-context.js";
import { Institution, Membership, MembershipInvitation, User } from "../models/index.js";
import { accountUsage } from "../services/account-limits.js";
import { hashPassword, verifyPassword, clearSession, issueSession } from "../services/local-auth.js";
import { isPlatformAdminEmail } from "../services/platform.js";

export const authRouter = Router();

const credentials = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});
// PERSONAL = cuenta de docente (aula individual); INSTITUTION = cuenta que gestiona varios docentes.
const registration = credentials.extend({
  name: z.string().trim().min(2).max(160),
  accountType: z.enum(["PERSONAL", "INSTITUTION"]).default("PERSONAL"),
  institutionName: z.string().trim().min(2).max(120).optional(),
}).refine((value) => value.accountType !== "INSTITUTION" || Boolean(value.institutionName), { path: ["institutionName"], message: "Escribe el nombre de la institución." });

// Frena intentos repetidos de adivinar claves. Se cuenta por correo, sin guardar direcciones IP.
const accessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (request) => typeof request.body?.email === "string" ? `access:${request.body.email.trim().toLowerCase().slice(0, 254)}` : "access:sin-correo",
  validate: false,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Demasiados intentos con este correo. Espera 15 minutos e inténtalo de nuevo." } },
});

async function createAccount(input: z.infer<typeof registration>) {
  const email = input.email.toLowerCase();
  if (await User.exists({ email })) throw new AppError(409, "ACCOUNT_EXISTS", "Ya existe una cuenta con ese correo. Inicia sesión o usa otro correo.");
  const configuredAdmin = email === process.env.AULANEXO_ADMIN_EMAIL?.toLowerCase();
  if (configuredAdmin && process.env.AULANEXO_ADMIN_PASSWORD && input.password !== process.env.AULANEXO_ADMIN_PASSWORD) {
    throw new AppError(403, "ADMIN_REGISTRATION_RESTRICTED", "El correo administrativo requiere la clave configurada.");
  }
  const type = configuredAdmin ? "INSTITUTION" : input.accountType;
  const user = await User.create({ authId: randomUUID(), displayName: input.name, email, passwordHash: await hashPassword(input.password), active: true });
  // Un docente invitado por una institución entra a ella: no se le crea un aula aparte.
  // La invitación se acepta en su primer acceso (auth-context).
  if (type === "PERSONAL" && !configuredAdmin && await MembershipInvitation.exists({ email, acceptedAt: { $exists: false }, expiresAt: { $gt: new Date() } })) {
    return { user, institution: null };
  }
  const institution = await Institution.create({
    name: configuredAdmin ? (process.env.AULANEXO_INITIAL_INSTITUTION_NAME || "Institución SIRAE") : type === "INSTITUTION" ? input.institutionName! : `${input.name} · Aula personal`,
    type,
    ownerUserId: user._id,
    timezone: "America/Bogota",
    active: true,
  });
  await Membership.create({ userId: user._id, institutionId: institution._id, role: "ADMIN", active: true, courseGroupIds: [] });
  return { user, institution };
}

authRouter.post("/login", accessLimiter, async (request, response, next) => {
  try {
    const input = credentials.parse(request.body);
    let user = await User.findOne({ email: input.email.toLowerCase(), active: true }).select("+passwordHash");
    if (!user && input.email.toLowerCase() === process.env.AULANEXO_ADMIN_EMAIL?.toLowerCase() && input.password === process.env.AULANEXO_ADMIN_PASSWORD) {
      ({ user } = await createAccount({ name: "Administrador SIRAE", email: input.email, password: input.password, accountType: "INSTITUTION" }));
    }
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new AppError(401, "INVALID_CREDENTIALS", "Correo o clave incorrectos.");
    await issueSession(request, response, { authId: user.authId, name: user.displayName, email: user.email });
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), lastSeenAt: new Date() } });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/register", accessLimiter, async (request, response, next) => {
  try {
    const input = registration.parse(request.body);
    const { user } = await createAccount(input);
    await issueSession(request, response, { authId: user.authId, name: user.displayName, email: user.email });
    response.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Cambia el espacio activo (aula propia o institución) entre los que la persona tiene acceso.
authRouter.post("/workspace", async (request, response, next) => {
  try {
    const { institutionId } = z.object({ institutionId: z.string().regex(/^[a-f\d]{24}$/i) }).strict().parse(request.body);
    const context = await resolveAuthenticatedContext(request);
    const allowed = (await listUserWorkspaces(context.user.id)).some((workspace) => workspace.institutionId === institutionId);
    if (!allowed) throw new AppError(403, "FORBIDDEN", "No perteneces a ese espacio.");
    await User.updateOne({ _id: context.user.id }, { $set: { activeInstitutionId: institutionId } });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (request, response) => {
  clearSession(request, response);
  response.status(204).end();
});

authRouter.get("/me", async (request, response, next) => {
  try {
    if (!isDatabaseReady() && !(await ensureDatabase(2))) {
      response.status(503).json({
        authenticated: false,
        database: "unavailable",
        message: "MongoDB no está disponible. Inténtalo nuevamente en unos minutos.",
      });
      return;
    }

    try {
      const context = await resolveAuthenticatedContext(request);
      response.json({
        authenticated: true,
        user: {
          id: context.user.id,
          name: context.user.name,
          email: context.user.email,
          role: context.membership.role,
          platformAdmin: isPlatformAdminEmail(context.user.email),
          institution: context.institution,
          accountType: context.institution.type ?? "PERSONAL",
          workspaces: await listUserWorkspaces(context.user.id),
          plan: await accountUsage(context),
        },
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "UNAUTHORIZED") {
        response.json({ authenticated: false });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});
