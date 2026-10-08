import type { NextFunction, Request, Response } from "express";
import { getEnvironment } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function firstForwardedValue(value: string | string[] | undefined): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue?.split(",")[0]?.trim();
}

function expectedOrigin(request: Request): string {
  const configuredOrigin = getEnvironment().APP_ORIGIN;
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, "");

  const host = firstForwardedValue(request.headers["x-forwarded-host"]) || request.get("host");
  if (!host || /[\s/]/.test(host)) {
    throw new AppError(403, "CSRF_ORIGIN_INVALID", "No fue posible verificar el origen de la solicitud.");
  }

  const protocol = firstForwardedValue(request.headers["x-forwarded-proto"]);
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  return `${protocol || (isLocalHost ? "http" : "https")}://${host}`;
}

function suppliedOrigin(request: Request): string | undefined {
  const origin = request.get("origin");
  if (origin) return origin;

  const referer = request.get("referer");
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

export function protectFromCrossSiteRequests(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(request.method)) {
    next();
    return;
  }

  try {
    if (suppliedOrigin(request) !== expectedOrigin(request)) {
      next(new AppError(403, "CSRF_REJECTED", "La solicitud no proviene de SIRAE."));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
