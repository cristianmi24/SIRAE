import { C, PdfReport, fmtGrade } from "./pdf-layout.js";

// Planilla de definitivas por curso. Con muchas asignaturas la hoja va horizontal.
export async function renderCourseGradesPdf(data: {
  institutionName: string; generatedAt: string;
  course: { label: string; academicYear: number };
  period?: { name: string; scale: { min: number; max: number; bands: { label: string; min: number; max: number }[] } };
  subjects: { id: string; name: string }[];
  students: { name: string; document: string; grades: Record<string, number>; average?: number }[];
}): Promise<Buffer> {
  const pdf = new PdfReport({ title: `Notas · Curso ${data.course.label}`, subtitle: "Planilla de notas por curso", institution: data.institutionName, generatedAt: new Date(data.generatedAt), landscape: data.subjects.length > 4, footerNote: `Documento confidencial · Curso ${data.course.label}` });
  pdf.title("Consolidado de definitivas", `Curso ${data.course.label}`, [["Periodo", data.period?.name ?? "Todos los periodos"], ["Año", String(data.course.academicYear)], ["Estudiantes", String(data.students.length)]]);
  pdf.section("01", "Definitivas por asignatura");
  const low = data.period?.scale.bands[0];
  const band = (value?: number) => value === undefined ? undefined : data.period?.scale.bands.find((b) => value >= b.min && value <= b.max)?.label;
  if (!data.students.length) pdf.empty("Este curso no tiene estudiantes activos.");
  else if (!data.subjects.length) pdf.empty("Este curso no tiene asignaturas.");
  else {
    pdf.table(
      [{ label: "#", width: 0.6, align: "right" }, { label: "Estudiante", width: 4.5 }, ...data.subjects.map((s) => ({ label: s.name, width: 1.6, align: "center" as const })), { label: "Promedio", width: 1.7, align: "center" }],
      data.students.map((s, i) => [String(i + 1), { text: s.name, note: s.document }, ...data.subjects.map((sub) => { const v = s.grades[sub.id]; return { text: fmtGrade(v), color: low && v !== undefined && v <= low.max ? C.coral : undefined, bold: Boolean(low && v !== undefined && v <= low.max) }; }), { text: fmtGrade(s.average), bold: true, note: band(s.average) }]),
    );
    const graded = data.students.filter((s) => s.average !== undefined);
    pdf.highlight("Promedio del curso", graded.length ? fmtGrade(graded.reduce((sum, s) => sum + s.average!, 0) / graded.length) : "Sin datos");
    if (low) pdf.paragraph(`Las notas en rojo están en el nivel ${low.label} (${low.min} a ${low.max}).`, { size: 8.5, color: C.muted });
  }
  return pdf.finish();
}

// Historial que consulta el propio estudiante con su código o QR.
export async function renderStudentSelfPdf(r: {
  student: { name: string; code: string; course?: string }; institution: string; generatedAt: string;
  attendance: { classes: number; present: number; late: number; absent: number; justified: number; percent?: number };
  history: { date: string; subject: string; status: string; statusLabel: string; time?: string }[];
  grades: { average?: number; performance?: string; periods: { name: string; average: number; performance?: string }[]; assessments: { period: string; subject: string; name: string; value: number; feedback?: string }[] };
}): Promise<Buffer> {
  const pdf = new PdfReport({ title: `Historial — ${r.student.name}`, subtitle: "Mi historial académico", institution: r.institution, generatedAt: new Date(r.generatedAt), footerNote: `Consulta personal de solo lectura · Código ${r.student.code}` });
  const a = r.attendance;
  pdf.title("Historial hasta hoy", r.student.name, [["Código", r.student.code], ["Curso", r.student.course ?? "Sin curso"]]);
  pdf.section("01", "Asistencia");
  pdf.metrics([["Clases", a.classes], ["Asistencia", a.percent === undefined ? "Sin datos" : `${a.percent}%`], ["A tiempo", a.present], ["Tarde", a.late], ["No llegó", a.absent], ["Justificadas", a.justified]]);
  pdf.bar([{ value: a.present, color: C.green }, { value: a.late, color: C.amber }, { value: a.justified, color: C.blue }, { value: a.absent, color: C.coral }]);
  const statusColor: Record<string, string> = { PRESENT: C.green, LATE: C.amber, ABSENT: C.coral, JUSTIFIED: C.blue };
  if (r.history.length) pdf.table([{ label: "Día", width: 3 }, { label: "Clase", width: 3.5 }, { label: "Estado", width: 2 }, { label: "Hora de entrada", width: 2, align: "right" }], r.history.map((h) => [h.date, h.subject, { text: h.statusLabel, bold: true, color: statusColor[h.status] }, h.time ?? "—"]));
  else pdf.empty("Todavía no hay asistencias registradas.");
  pdf.section("02", "Notas");
  if (r.grades.periods.length) pdf.table([{ label: "Periodo", width: 5 }, { label: "Promedio", width: 2, align: "right" }, { label: "Nivel", width: 2 }], r.grades.periods.map((p) => [p.name, { text: fmtGrade(p.average), bold: true }, p.performance ?? "—"]));
  if (r.grades.assessments.length) pdf.table([{ label: "Nota", width: 4 }, { label: "Asignatura", width: 3 }, { label: "Periodo", width: 3 }, { label: "Valor", width: 1.5, align: "right" }], r.grades.assessments.map((x) => [{ text: x.name, note: x.feedback }, x.subject, x.period, { text: fmtGrade(x.value), bold: true }]));
  else pdf.empty("Todavía no tienes notas registradas.");
  pdf.highlight("Promedio del periodo más reciente", r.grades.average === undefined ? "Sin datos" : `${fmtGrade(r.grades.average)}${r.grades.performance ? ` · ${r.grades.performance}` : ""}`);
  return pdf.finish();
}

// Tarjetas recortables con nombre y código de asistencia (3 por fila).
export async function renderCodesPdf(data: { institution: string; title: string; rows: { name: string; code: string; course?: string }[] }): Promise<Buffer> {
  const pdf = new PdfReport({ title: `Códigos · ${data.title}`, subtitle: "Códigos de asistencia", institution: data.institution, footerNote: "Entrega cada código de forma personal. No publiques la lista completa." });
  pdf.title("Códigos de asistencia", data.title);
  pdf.paragraph("Recorta y entrega a cada estudiante su código. Con él registra su asistencia en el enlace que abra el docente y consulta su historial.", { size: 9, color: C.muted });
  if (!data.rows.length) { pdf.empty("No hay estudiantes activos."); return pdf.finish(); }
  const d = pdf.doc; const cols = 3; const gap = 10; const w = (pdf.width - gap * (cols - 1)) / cols; const h = 74;
  d.moveDown(.5);
  data.rows.forEach((row, i) => {
    const col = i % cols;
    if (col === 0) pdf.ensure(h + gap);
    const x = pdf.left + col * (w + gap); const y = d.y;
    d.roundedRect(x, y, w, h, 6).dash(3, { space: 3 }).lineWidth(.8).strokeColor(C.slate).stroke().undash();
    d.fillColor(C.ink).font("Helvetica-Bold").fontSize(9).text(row.name, x + 8, y + 9, { width: w - 16, align: "center", lineBreak: false, ellipsis: true });
    d.fillColor(C.blue).font("Helvetica-Bold").fontSize(22).text(row.code, x + 8, y + 25, { width: w - 16, align: "center", characterSpacing: 3, lineBreak: false });
    d.fillColor(C.muted).font("Helvetica").fontSize(7.5).text(row.course ? `Curso ${row.course}` : "Sin curso", x + 8, y + 55, { width: w - 16, align: "center", lineBreak: false });
    d.x = pdf.left; d.y = col === cols - 1 || i === data.rows.length - 1 ? y + h + gap : y;
  });
  return pdf.finish();
}
