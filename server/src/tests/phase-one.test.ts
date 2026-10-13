import { describe, expect, it } from "vitest";
import { createOpaqueQrToken, createQrDataUrl, createQrPayload, hashQrPayload } from "../utils/qr.js";
import { normalizeForLookup } from "../utils/text.js";
import { studentInputSchema, studentUpdateSchema } from "../validators/students.js";

describe("seguridad QR de SIRAE", () => {
  it("genera tokens opacos y hashes deterministas sin información personal", () => {
    const token = createOpaqueQrToken();
    const payload = createQrPayload(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(payload).toMatch(/^aulanexo:student:v1:/);
    expect(payload).not.toContain("Ana Gómez");
    expect(hashQrPayload(payload)).toHaveLength(64);
    expect(hashQrPayload(payload)).toBe(hashQrPayload(payload));
  });

  it("genera un QR PNG de alta resolución para impresión y permite una variante compacta", async () => {
    const payload = createQrPayload(createOpaqueQrToken());
    const readDimensions = (dataUrl: string) => {
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
      return [png.readUInt32BE(16), png.readUInt32BE(20)];
    };

    expect(readDimensions(await createQrDataUrl(payload))).toEqual([1024, 1024]);
    expect(readDimensions(await createQrDataUrl(payload, 640))).toEqual([640, 640]);
  });
});

describe("validación de estudiantes", () => {
  it("acepta un perfil académico mínimo sin datos personales adicionales", () => {
    const result = studentInputSchema.parse({
      firstName: "Valentina",
      lastName: "Mora",
      document: "ROC-1001",
      email: "",
    });
    expect(result.document).toBe("ROC-1001");
    expect(result.email).toBe("");
  });

  it("normaliza documento para impedir duplicados con variación de mayúsculas", () => {
    expect(normalizeForLookup(" roc-á1 ")).toBe("ROC-A1");
  });

  it("rechaza un correo inválido", () => {
    expect(() => studentInputSchema.parse({ firstName: "Ana", lastName: "Luna", document: "A-1", email: "no-es-correo" })).toThrow();
  });

  it("permite limpiar contacto y grupo de forma explícita al editar", () => {
    expect(studentUpdateSchema.parse({ email: null, phone: null, courseGroupId: null })).toEqual({
      email: null,
      phone: null,
      courseGroupId: null,
    });
  });
});
