import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import type { MembershipRole } from "../../../shared/types.js";
import { isDatabaseReady } from "../config/database.js";
import { AppError, forbidden, unavailable } from "../utils/errors.js";
import { resolveAuthenticatedContext, type AuthContext } from "../services/auth-context.js";

export async function requireAuthenticatedContext(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!isDatabaseReady()) {
      throw unavailable("MongoDB no está disponible. Inténtalo nuevamente en unos minutos.");
    }
    request.auth = await resolveAuthenticatedContext(request);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: MembershipRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const context = request.auth;
    if (!context || !roles.includes(context.membership.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}

export function requireAuthContext(request: Request): AuthContext {
  if (!request.auth) {
    throw forbidden("No existe un contexto autorizado para esta operación.");
  }
  return request.auth;
}

export function notFoundHandler(_request: Request, _response: Response, next: NextFunction): void {
  next(new AppError(404, "NOT_FOUND", "No se encontró el endpoint solicitado."));
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    const details = Object.fromEntries(
      error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]),
    );
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos marcados e inténtalo nuevamente.",
        details,
      },
    });
    return;
  }

  if (typeof error === "object" && error && "code" in error && (error as { code?: number }).code === 11000) {
    response.status(409).json({
      error: {
        code: "DUPLICATE_RECORD",
        message: "Ya existe un registro con esa información en esta institución.",
      },
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  console.error("Unexpected API error", error);
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocurrió un error inesperado. Inténtalo nuevamente.",
    },
  });
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
