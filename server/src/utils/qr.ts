import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";

const QR_PREFIX = "aulanexo:student:v1:";

export function createOpaqueQrToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createQrPayload(token: string): string {
  return `${QR_PREFIX}${token}`;
}

export function hashQrPayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

export async function createQrDataUrl(payload: string, width = 1024): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 4,
    width,
    color: {
      dark: "#173F5F",
      light: "#FFFFFF",
    },
  });
}

// El token del QR se guarda cifrado (AES-256-GCM) para poder volver a mostrar y descargar el QR del estudiante.
// La clave sale de QR_ENCRYPTION_KEY o, si no existe, de AUTH_JWT_SECRET. La base de datos por sí sola no revela el token.
function qrKey(): Buffer {
  const secret = process.env.QR_ENCRYPTION_KEY || process.env.AUTH_JWT_SECRET || "";
  if (secret.length < 16) throw new Error("Falta la clave para proteger los QR (QR_ENCRYPTION_KEY o AUTH_JWT_SECRET).");
  return createHash("sha256").update(`sirae-qr-v1:${secret}`).digest();
}

export function sealQrToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", qrKey(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openQrToken(sealed?: string | null): string | null {
  if (!sealed) return null;
  try {
    const [version, iv, tag, body] = sealed.split(".");
    if (version !== "v1" || !iv || !tag || !body) return null;
    const decipher = createDecipheriv("aes-256-gcm", qrKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch { return null; }
}
