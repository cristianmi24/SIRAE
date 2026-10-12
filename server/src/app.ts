import express, { type Express } from "express";
import { ensureDeviceId, publicLinkInfo, publicRegister } from "./services/attendance-link.js";
import { studentSelfReport } from "./services/student-self.js";
import { complaintInput, complaintUpdate, createComplaint, listComplaints, updateComplaint } from "./services/complaints.js";
import { renderStudentSelfPdf } from "./utils/report-pdfs.js";
import { analyticsRealtime, analyticsSummary } from "./services/google-analytics.js";
import { blockPlatformAdminWrites, createPlatformInstitution, platformAdmins, platformInstitutionInput, platformInstitutionPatch, platformOverview, requirePlatformAdmin, updatePlatformInstitution } from "./services/platform.js";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { isDatabaseReady } from "./config/database.js";
import { authRouter } from "./routes/auth.js";
import { courseGroupRouter, studentRouter } from "./routes/academic.js";
import { developmentRouter } from "./routes/development.js";
import { learningRouter } from "./routes/learning.js";
import { protectFromCrossSiteRequests } from "./middleware/csrf.js";
import {
  errorHandler,
  notFoundHandler,
  rejectUnsafePayload,
  requireAuthenticatedContext,
} from "./middleware/security.js";

export function createApp(): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    }),
  );
  app.use((_request, response, next) => {
    response.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()");
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 500,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Se alcanzó el límite de solicitudes. Espera unos minutos e inténtalo de nuevo.",
        },
      },
    }),
  );
  app.use("/api", protectFromCrossSiteRequests);
  app.use("/api", rejectUnsafePayload);
  // Se cuenta por dispositivo (identificador generado por el sistema), sin usar direcciones IP.
  const publicAttendanceLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, keyGenerator: (request) => typeof request.cookies?.aulanexo_device === "string" ? request.cookies.aulanexo_device : "sin-dispositivo", validate: false, standardHeaders: "draft-7", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Demasiados intentos. Espera un minuto." } } });

  app.get("/api/health", (_request, response) => {
    const databaseReady = isDatabaseReady();
    response.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? "ok" : "degraded",
      database: databaseReady ? "connected" : "unavailable",
    });
  });
  app.use("/api/auth", authRouter);
  // Registro de asistencia por código: público, sin sesión, solo mientras el docente lo habilite.
  app.get("/api/public/attendance/:token", async (request, response, next) => { try { response.setHeader("Cache-Control", "no-store"); response.json(await publicLinkInfo(request, response, String(request.params.token))); } catch (error) { next(error); } });
  app.post("/api/public/student-report", publicAttendanceLimiter, async (request, response, next) => { try { response.setHeader("Cache-Control", "no-store"); ensureDeviceId(request, response); const body = request.body ?? {}; response.json(await studentSelfReport(request, { code: typeof body.code === "string" ? body.code.slice(0, 32) : undefined, tokenHash: typeof body.tokenHash === "string" ? body.tokenHash.slice(0, 64) : undefined })); } catch (error) { next(error); } });
  app.post("/api/public/student-report.pdf", publicAttendanceLimiter, async (request, response, next) => { try { ensureDeviceId(request, response); const body = request.body ?? {}; const report = await studentSelfReport(request, { code: typeof body.code === "string" ? body.code.slice(0, 32) : undefined, tokenHash: typeof body.tokenHash === "string" ? body.tokenHash.slice(0, 64) : undefined }); const pdf = await renderStudentSelfPdf(report); response.setHeader("Content-Type", "application/pdf"); response.setHeader("Content-Disposition", `attachment; filename="sirae-historial-${report.student.code}.pdf"`); response.setHeader("Cache-Control", "no-store"); response.send(pdf); } catch (error) { next(error); } });
  app.post("/api/public/attendance/:token", publicAttendanceLimiter, async (request, response, next) => { try { const code = typeof request.body?.code === "string" ? request.body.code.slice(0, 32) : ""; response.json(await publicRegister(request, response, String(request.params.token), code)); } catch (error) { next(error); } });
  // Quejas y solicitudes: formulario público, sin sesión. Pocos envíos por dispositivo para frenar abusos.
  const complaintLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, keyGenerator: (request) => typeof request.cookies?.aulanexo_device === "string" ? `queja:${request.cookies.aulanexo_device}` : "queja:sin-dispositivo", validate: false, standardHeaders: "draft-7", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Ya enviaste varias solicitudes. Espera una hora para enviar otra." } } });
  app.post("/api/public/complaints", complaintLimiter, async (request, response, next) => { try { ensureDeviceId(request, response); response.setHeader("Cache-Control", "no-store"); response.status(201).json(await createComplaint(complaintInput.parse(request.body))); } catch (error) { next(error); } });
  app.get("/api/platform/complaints", requireAuthenticatedContext, requirePlatformAdmin, async (_request, response, next) => { try { response.setHeader("Cache-Control", "private, no-store"); response.json(await listComplaints()); } catch (error) { next(error); } });
  app.patch("/api/platform/complaints/:id", requireAuthenticatedContext, requirePlatformAdmin, async (request, response, next) => { try { response.json({ item: await updateComplaint(String(request.params.id), complaintUpdate.parse(request.body)) }); } catch (error) { next(error); } });
  app.use("/api/course-groups", requireAuthenticatedContext, blockPlatformAdminWrites, courseGroupRouter);
  app.use("/api/students", requireAuthenticatedContext, blockPlatformAdminWrites, studentRouter);
  app.use("/api/development", requireAuthenticatedContext, blockPlatformAdminWrites, developmentRouter);
  app.use("/api/learning", requireAuthenticatedContext, blockPlatformAdminWrites, learningRouter);
  app.get("/api/platform/overview", requireAuthenticatedContext, requirePlatformAdmin, async (request, response, next) => { try { response.json(await platformOverview(request.auth!)); } catch (error) { next(error); } });
  app.get("/api/platform/analytics", requireAuthenticatedContext, requirePlatformAdmin, async (request, response, next) => { try { const days = [7, 28, 90].includes(Number(request.query.days)) ? Number(request.query.days) : 28; response.setHeader("Cache-Control", "private, no-store"); response.json(await analyticsSummary(days)); } catch (error) { next(error); } });
  app.get("/api/platform/analytics/realtime", requireAuthenticatedContext, requirePlatformAdmin, async (_request, response, next) => { try { response.setHeader("Cache-Control", "private, no-store"); response.json(await analyticsRealtime()); } catch (error) { next(error); } });
  app.get("/api/platform/admins", requireAuthenticatedContext, requirePlatformAdmin, async (_request, response, next) => { try { response.setHeader("Cache-Control", "private, no-store"); response.json(await platformAdmins()); } catch (error) { next(error); } });
  app.post("/api/platform/institutions", requireAuthenticatedContext, requirePlatformAdmin, async (request, response, next) => { try { response.status(201).json({ item: await createPlatformInstitution(request.auth!, platformInstitutionInput.parse(request.body)) }); } catch (error) { next(error); } });
  app.patch("/api/platform/institutions/:id", requireAuthenticatedContext, requirePlatformAdmin, async (request, response, next) => { try { response.json({ item: await updatePlatformInstitution(String(request.params.id), platformInstitutionPatch.parse(request.body)) }); } catch (error) { next(error); } });
  app.use("/api", notFoundHandler);

  return app;
}

export function addFinalErrorHandling(app: Express): void {
  app.use(notFoundHandler);
  app.use(errorHandler);
}
