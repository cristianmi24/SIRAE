import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { getEnvironment } from "../config/env.js";
import { unauthorized, unavailable } from "../utils/errors.js";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "aulanexo_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export interface SessionIdentity { authId: string; name?: string; email?: string }

function signingKey(): Uint8Array {
  const secret = getEnvironment().AUTH_JWT_SECRET;
  if (!secret) throw unavailable("La autenticación local no está configurada.");
  return new TextEncoder().encode(secret);
}

function publicHttps(request: Request): boolean {
  if (process.env.APP_ORIGIN?.startsWith("https://")) return true;
  if (request.headers["x-forwarded-proto"] === "https") return true;
  const host = request.get("host") || "";
  return !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

export function applicationCookieOptions(request: Request) {
  const secure = publicHttps(request);
  return { httpOnly: true, secure, sameSite: (secure ? "none" : "lax") as "none" | "lax", path: "/" };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [saltHex, hashHex] = encoded.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function issueSession(request: Request, response: Response, identity: SessionIdentity): Promise<void> {
  const token = await new SignJWT({ authId: identity.authId, name: identity.name, email: identity.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(signingKey());
  response.cookie(SESSION_COOKIE, token, { ...applicationCookieOptions(request), maxAge: SESSION_DURATION_SECONDS * 1000 });
}

export async function getSessionIdentity(request: Request): Promise<SessionIdentity> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== "string") throw unauthorized();
  const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
  const authId = typeof payload.authId === "string" ? payload.authId : undefined;
  if (!authId) throw unauthorized("La sesión no es válida.");
  return {
    authId,
    name: typeof payload.name === "string" ? payload.name : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}

export function clearSession(request: Request, response: Response): void {
  response.clearCookie(SESSION_COOKIE, applicationCookieOptions(request));
}
