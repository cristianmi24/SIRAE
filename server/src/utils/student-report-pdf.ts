import { C, PdfReport, fmtGrade } from "./pdf-layout.js";

export interface StudentReportPdfData {
  institutionName?: string;
  studentName: string;
  documentNumber: string;
  groupLabel: string;
  periodName: string;
  subjectName: string;
  fromKey?: string;
  toKey?: string;
  timezone: string;
  sessionCount: number;
  attendance: { present: number; late: number; absent: number; justified: number; pendingReview: number };
  attendancePercent?: number;
  grades: {
    periods: { name: string; average: number; performance?: string }[];
    average?: number;
    performance?: string;
    assessments: { periodName: string; subjectName: string; name: string; value: number; feedback?: string }[];
    categories?: { periodId: string; periodName: string; subjectId: string; subjectName: string; average?: number; weightPercent: number }[];
  };
  observations: { observedAt: Date; type: string; priority: string; status: string; description: string; followUp?: string }[];
}

const priorityLabel: Record<string, string> = { HIGH: "Prioridad alta", NORMAL: "Prioridad normal", LOW: "Prioridad baja" };
const statusLabel: Record<string, string> = { OPEN: "Abierta", IN_PROGRESS: "En seguimiento", CLOSED: "Cerrada" };

// Definitiva por periodo y asignatura a partir de las categorías ponderadas.
function subjectRows(data: StudentReportPdfData) {
  const map = new Map<string, { period: string; subject: string; total: number; weight: number }>();
  for (const c of data.grades.categories ?? []) {
    if (c.average === undefined || !c.weightPercent) continue;
    const key = `${c.periodId}|${c.subjectId}`;
    const row = map.get(key) ?? { period: c.periodName, subject: c.subjectName, total: 0, weight: 0 };
    row.total += c.average * c.weightPercent; row.weight += c.weightPercent; map.set(key, row);
  }
  return [...map.values()].map((row) => ({ period: row.period, subject: row.subject, average: row.total / row.weight }));
}

function synthesis(d: StudentReportPdfData) {
  const parts = [
    d.attendancePercent !== undefined ? `asistió al ${d.attendancePercent}% de las ${d.sessionCount} clases cerradas` : undefined,
    d.attendance.late ? `con ${d.attendance.late} ${d.attendance.late === 1 ? "llegada tarde" : "llegadas tarde"}` : undefined,
    d.grades.average !== undefined ? `su promedio del periodo más reciente es ${fmtGrade(d.grades.average)}${d.grades.performance ? ` (${d.grades.performance})` : ""}` : undefined,
    d.observations.length ? `tiene ${d.observations.length} ${d.observations.length === 1 ? "observación registrada" : "observaciones registradas"}` : undefined,
  ].filter(Boolean);
  return parts.length ? `${d.studentName} ${parts.join(", ")}. Esta síntesis describe únicamente los datos registrados; una coincidencia entre asistencia y rendimiento no demuestra que una cause la otra.` : "";
}

// Informe académico individual en PDF (archivo generado por el servidor).
export async function renderStudentPdf(data: StudentReportPdfData): Promise<Buffer> {
  const pdf = new PdfReport({ title: `Informe académico — ${data.studentName}`, subtitle: "Informe académico individual", institution: data.institutionName ?? "SIRAE", timezone: data.timezone, footerNote: `Documento confidencial. Acceso según los permisos de ${data.institutionName ?? "la institución"}.  ·  Código ${data.documentNumber}` });
  const a = data.attendance;
  pdf.title("Registro de desempeño estudiantil", data.studentName, [["Código", data.documentNumber], ["Curso", data.groupLabel]]);
  pdf.filters([["Periodo", data.periodName], ["Asignatura", data.subjectName], ["Rango", `${data.fromKey ?? "Sin inicio"} – ${data.toKey ?? "Sin fin"}`]]);

  pdf.section("01", "Asistencia");
  pdf.metrics([["Clases cerradas", data.sessionCount], ["Asistencia", data.attendancePercent === undefined ? "Sin datos" : `${data.attendancePercent}%`], ["A tiempo", a.present], ["Tarde", a.late], ["Ausencias", a.absent], ["Justificadas", a.justified], ["Por revisar", a.pendingReview]]);
  pdf.bar([{ value: a.present, color: C.green }, { value: a.late, color: C.amber }, { value: a.justified, color: C.blue }, { value: a.absent, color: C.coral }, { value: a.pendingReview, color: C.slate }]);
  if (!(a.present + a.late + a.absent + a.justified + a.pendingReview)) pdf.empty("Aún no hay clases registradas para este filtro.");

  pdf.section("02", "Rendimiento por periodo");
  const rows = subjectRows(data);
  if (rows.length) pdf.table([{ label: "Periodo", width: 3 }, { label: "Asignatura", width: 4 }, { label: "Definitiva", width: 2, align: "right" }], rows.map((r) => [r.period, r.subject, { text: fmtGrade(r.average), bold: true }]));
  else if (data.grades.periods.length) pdf.table([{ label: "Periodo", width: 5 }, { label: "Promedio", width: 2, align: "right" }, { label: "Nivel", width: 2 }], data.grades.periods.map((p) => [p.name, { text: fmtGrade(p.average), bold: true }, p.performance ?? "—"]));
  else pdf.empty("No hay calificaciones registradas con los filtros elegidos.");
  pdf.highlight("Promedio del periodo más reciente", data.grades.average === undefined ? "Sin datos" : `${fmtGrade(data.grades.average)}${data.grades.performance ? ` · ${data.grades.performance}` : ""}`);

  pdf.section("03", "Notas registradas");
  if (data.grades.assessments.length) pdf.table([{ label: "Nota", width: 4 }, { label: "Asignatura", width: 3 }, { label: "Periodo", width: 3 }, { label: "Valor", width: 1.5, align: "right" }],
    data.grades.assessments.slice(0, 400).map((x) => [{ text: x.name, note: x.feedback }, x.subjectName, x.periodName, { text: fmtGrade(x.value), bold: true }]));
  else pdf.empty("No hay notas registradas con los filtros elegidos.");

  pdf.section("04", "Observaciones y seguimiento");
  if (data.observations.length) pdf.timeline(data.observations.map((o) => ({ meta: `${o.observedAt.toLocaleDateString("es-CO", { timeZone: data.timezone, day: "numeric", month: "short", year: "numeric" })} · ${o.type} · ${priorityLabel[o.priority] ?? o.priority} · ${statusLabel[o.status] ?? o.status}`, text: o.description, note: o.followUp ? `Próximo paso: ${o.followUp}` : undefined })));
  else pdf.empty("No hay observaciones en el rango elegido.");

  pdf.section("05", "Síntesis");
  const text = synthesis(data);
  if (text) pdf.paragraph(text, { size: 10.5, color: C.ink }); else pdf.empty("Todavía no hay datos suficientes para escribir una síntesis.");
  return pdf.finish();
}
