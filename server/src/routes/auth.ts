import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureDatabase, isDatabaseReady } from "../config/database.js";
import { AppError } from "../utils/errors.js";
import { resolveAuthenticatedContext } from "../services/auth-context.js";
import { Institution, Membership, User } from "../models/index.js";
import { hashPassword, verifyPassword, clearSession, issueSession } from "../services/local-auth.js";
import { isPlatformAdminEmail } from "../services/platform.js";

export const authRouter = Router();

const credentials = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});
const registration = credentials.extend({
  name: z.string().trim().min(2).max(160),
  accountType: z.enum(["PERSONAL", "INSTITUTION"]).default("PERSONAL"),
});

async function createAccount(input: z.infer<typeof registration>) {
  const email = input.email.toLowerCase();
  if (await User.exists({ email })) throw new AppError(409, "ACCOUNT_EXISTS", "Ya existe una cuenta con ese correo. Inicia sesión o usa otro correo.");
  const configuredAdmin = email === process.env.AULANEXO_ADMIN_EMAIL?.toLowerCase();
  if (configuredAdmin && process.env.AULANEXO_ADMIN_PASSWORD && input.password !== process.env.AULANEXO_ADMIN_PASSWORD) {
    throw new AppError(403, "ADMIN_REGISTRATION_RESTRICTED", "El correo administrativo requiere la clave configurada.");
  }
  const type = configuredAdmin ? "INSTITUTION" : "PERSONAL";
  const user = await User.create({ authId: randomUUID(), displayName: input.name, email, passwordHash: await hashPassword(input.password), active: true });
  const institution = await Institution.create({
    name: configuredAdmin ? (process.env.AULANEXO_INITIAL_INSTITUTION_NAME || "Institución SIRAE") : `${input.name} · Aula personal`,
    type,
    ownerUserId: user._id,
    timezone: "America/Bogota",
    active: true,
  });
  await Membership.create({ userId: user._id, institutionId: institution._id, role: "ADMIN", active: true, courseGroupIds: [] });
  return { user, institution };
}

authRouter.post("/login", async (request, response, next) => {
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

authRouter.post("/register", async (request, response, next) => {
  try {
    const input = registration.parse(request.body);
    const { user } = await createAccount(input);
    await issueSession(request, response, { authId: user.authId, name: user.displayName, email: user.email });
    response.status(201).json({ ok: true });
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
