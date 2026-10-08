import { describe, expect, it } from "vitest";
import { renderStudentPdf } from "../utils/student-report-pdf.js";

describe("generación privada de PDF académico", () => {
  it("produce un PDF válido a partir de datos ficticios y una síntesis no causal", async () => {
    const pdf = await renderStudentPdf({
      studentName: "Estudiante de prueba",
      documentNumber: "DEMO-001",
      groupLabel: "8A",
      periodName: "Periodo de prueba",
      subjectName: "Matemáticas",
      fromKey: "2026-01-01",
      toKey: "2026-06-30",
      timezone: "America/Bogota",
      sessionCount: 4,
      attendance: { present: 2, late: 1, absent: 1, justified: 0, pendingReview: 0 },
      attendancePercent: 75,
      grades: {
        periods: [{ name: "Periodo de prueba", average: 4.2, performance: "Alto" }],
        average: 4.2,
        performance: "Alto",
        assessments: [{ periodName: "Periodo de prueba", subjectName: "Matemáticas", name: "Actividad ficticia", value: 4.2 }],
      },
      observations: [{ observedAt: new Date("2026-05-02T12:00:00.000Z"), type: "Seguimiento", priority: "NORMAL", status: "OPEN", description: "Dato ficticio de prueba", followUp: "Revisar progreso" }],
    });

    const raw = pdf.toString("latin1");
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(raw).toContain("(SIRAE)");
    expect(raw).toContain("%%EOF");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
