import { createHash, randomBytes } from "node:crypto";
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

export async function createQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 640,
    color: {
      dark: "#173F5F",
      light: "#FFFFFF",
    },
  });
}
