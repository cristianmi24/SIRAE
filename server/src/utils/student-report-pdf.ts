import PDFDocument from "pdfkit";
import { addEdutlanWatermark, drawSiraeLogo } from "./pdf-branding.js";

export interface StudentReportPdfData {
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
  };
  observations: { observedAt: Date; type: string; priority: string; status: string; description: string; followUp?: string }[];
}

export async function renderStudentPdf(data: StudentReportPdfData): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margin: 52, info: { Title: `Informe académico — ${data.studentName}`, Author: "SIRAE" } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  addEdutlanWatermark(document);
  drawSiraeLogo(document, 52, 40, 84);
  document.fillColor("#1B2559").fontSize(11).font("Helvetica-Bold").text("SIRAE", 150, 52).fontSize(9).font("Helvetica").fillColor("#6b7399").text("Sistema de Identificación y Registro de Asistencia Educativa").text("Informe académico individual");
  document.x = 52; document.y = 104;
  document.moveDown(1.2).fillColor("#172033").fontSize(19).font("Helvetica-Bold").text(data.studentName);
  document.fontSize(10).font("Helvetica").fillColor("#526174").text(`Código: ${data.documentNumber}   |   Curso/grupo: ${data.groupLabel}`);
  document.text(`Periodo: ${data.periodName}   |   Materia: ${data.subjectName}   |   Rango: ${data.fromKey ?? "Sin inicio"} – ${data.toKey ?? "Sin fin"}   |   Generado: ${new Date().toLocaleString("es-CO", { timeZone: data.timezone })}`);
  document.moveDown().fillColor("#173F5F").fontSize(13).font("Helvetica-Bold").text("Resumen de asistencia");
  document.moveDown(.3).fillColor("#263b4b").fontSize(10).font("Helvetica").text(`Sesiones cerradas: ${data.sessionCount}   ·   Asistencia: ${data.attendancePercent === undefined ? "Sin datos" : `${data.attendancePercent}%`}`);
  document.text(`A tiempo: ${data.attendance.present}   ·   Tardanzas: ${data.attendance.late}   ·   Ausencias: ${data.attendance.absent}   ·   Justificadas: ${data.attendance.justified}   ·   Pendientes de revisión: ${data.attendance.pendingReview}`);
  document.moveDown().fillColor("#173F5F").fontSize(13).font("Helvetica-Bold").text("Rendimiento por periodo");
  document.moveDown(.3).fillColor("#263b4b").fontSize(10).font("Helvetica");
  if (!data.grades.periods.length) document.text("No hay calificaciones registradas en los filtros seleccionados.");
  for (const item of data.grades.periods) document.text(`${item.name}: promedio ${item.average}${item.performance ? ` (${item.performance})` : ""}, en la escala original del periodo.`);
  document.moveDown(.4).font("Helvetica-Bold").text(`Promedio del periodo más reciente: ${data.grades.average === undefined ? "Sin datos" : data.grades.average.toFixed(2)}${data.grades.performance ? ` (${data.grades.performance})` : ""}`);
  document.moveDown(.4).font("Helvetica-Bold").text("Actividades calificadas").font("Helvetica");
  if (!data.grades.assessments.length) document.text("No hay actividades calificadas para los filtros seleccionados.");
  for (const item of data.grades.assessments.slice(0, 300)) document.text(`• ${item.periodName} · ${item.subjectName} · ${item.name}: ${item.value}${item.feedback ? ` — ${item.feedback}` : ""}`);
  if (data.grades.assessments.length > 300) document.text(`Se muestran 300 de ${data.grades.assessments.length} actividades; reduce los filtros para detallar el historial completo.`);
  document.moveDown().fillColor("#173F5F").fontSize(13).font("Helvetica-Bold").text("Observaciones y seguimiento");
  if (!data.observations.length) document.moveDown(.3).fillColor("#526174").fontSize(10).font("Helvetica").text("No hay observaciones almacenadas en el rango seleccionado.");
  for (const item of data.observations) {
    document.moveDown(.25).fillColor("#263b4b").fontSize(10).font("Helvetica-Bold").text(`${item.observedAt.toLocaleDateString("es-CO", { timeZone: data.timezone })} · ${item.type} · ${item.priority} · ${item.status}`);
    document.font("Helvetica").text(item.description);
    if (item.followUp) document.fillColor("#526174").text(`Seguimiento: ${item.followUp}`);
  }
  document.moveDown().fillColor("#173F5F").fontSize(13).font("Helvetica-Bold").text("Síntesis");
  const summary = [data.attendancePercent !== undefined ? `asistencia registrada en ${data.attendancePercent}% de las sesiones cerradas` : undefined, data.grades.average !== undefined ? `promedio del periodo más reciente ${data.grades.average.toFixed(2)}${data.grades.performance ? ` (${data.grades.performance})` : ""}` : undefined, data.attendance.pendingReview ? `${data.attendance.pendingReview} captura(s) pendientes de revisión docente` : undefined, data.observations.length ? `${data.observations.length} observación(es) en el rango` : undefined].filter(Boolean).join("; ");
  document.moveDown(.3).fillColor("#263b4b").fontSize(10).font("Helvetica").text(summary ? `${summary}. Esta síntesis describe únicamente los datos almacenados; una coincidencia entre asistencia y rendimiento no demuestra causalidad.` : "No hay suficientes datos almacenados para generar una síntesis académica.");
  document.moveDown(2).fillColor("#8996a2").fontSize(8).text("Documento confidencial · Acceso según permisos institucionales de SIRAE.", { align: "center" });
  document.end();
  return finished;
}
