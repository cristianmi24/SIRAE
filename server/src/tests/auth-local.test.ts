import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { applicationCookieOptions, hashPassword, verifyPassword } from "../services/local-auth.js";

function request(host: string, headers: Record<string, string> = {}): Request {
  return { headers, get(name: string) { return name.toLowerCase() === "host" ? host : undefined; } } as unknown as Request;
}

describe("autenticación local", () => {
  it("protege las claves con hash y permite verificarlas", async () => {
    const hash = await hashPassword("clave-segura-123");
    expect(hash).not.toContain("clave-segura-123");
    await expect(verifyPassword("clave-segura-123", hash)).resolves.toBe(true);
    await expect(verifyPassword("otra-clave", hash)).resolves.toBe(false);
  });

  it("usa cookie segura detrás de HTTPS y compatible en local", () => {
    expect(applicationCookieOptions(request("aulanexo.example.edu", { "x-forwarded-proto": "https" }))).toMatchObject({ httpOnly: true, secure: true, sameSite: "none" });
    expect(applicationCookieOptions(request("localhost:3000"))).toMatchObject({ httpOnly: true, secure: false, sameSite: "lax" });
  });
});
