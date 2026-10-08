import { describe, expect, it } from "vitest";
import { generateStudentCode, normalizeStudentCode } from "../utils/student-code.js";

describe("códigos de estudiante", () => {
  it("genera 3 letras y 3 números sin caracteres confusos", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateStudentCode();
      expect(code).toMatch(/^[A-HJ-NP-Z]{3}[2-9]{3}$/);
    }
  });
  it("normaliza lo que escribe el estudiante", () => {
    expect(normalizeStudentCode(" abc-123 ")).toBe("ABC123");
    expect(normalizeStudentCode("kmq 482")).toBe("KMQ482");
  });
});
