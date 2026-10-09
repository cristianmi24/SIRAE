import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { requireAuthContext } from "../middleware/security.js";
import { courseGradesReport, createStudentPdf, studentReportData } from "../services/reports.js";
import { renderCourseGradesPdf } from "../utils/report-pdfs.js";
import { reportFilterInput } from "../validators/learning.js";

export async function studentReportController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const context = requireAuthContext(request);
    const studentId = z.string().regex(/^[a-f\d]{24}$/i).parse(request.params.id);
    const filters = reportFilterInput.parse(request.query);
    const buffer = await createStudentPdf(context, studentId, filters);
    response.setHeader("Content-Type", "application/pdf"); response.setHeader("Content-Disposition", `attachment; filename="sirae-estudiante-${studentId}.pdf"`); response.setHeader("Cache-Control", "private, no-store");
    response.send(buffer);
  } catch (error) { next(error); }
}

export async function studentReportDataController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const context = requireAuthContext(request);
    const studentId = z.string().regex(/^[a-f\d]{24}$/i).parse(request.params.id);
    response.setHeader("Cache-Control", "private, no-store");
    response.json(await studentReportData(context, studentId, reportFilterInput.parse(request.query)));
  } catch (error) { next(error); }
}
export async function courseGradesReportController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const context = requireAuthContext(request);
    const courseId = z.string().regex(/^[a-f\d]{24}$/i).parse(request.params.id);
    const periodId = z.string().regex(/^[a-f\d]{24}$/i).optional().parse(typeof request.query.periodId === "string" && request.query.periodId ? request.query.periodId : undefined);
    response.setHeader("Cache-Control", "private, no-store");
    response.json(await courseGradesReport(context, courseId, periodId));
  } catch (error) { next(error); }
}

const sendPdf = (response: Response, buffer: Buffer, filename: string) => {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Cache-Control", "private, no-store");
  response.send(buffer);
};
export async function courseGradesPdfController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const context = requireAuthContext(request);
    const courseId = z.string().regex(/^[a-f\d]{24}$/i).parse(request.params.id);
    const periodId = z.string().regex(/^[a-f\d]{24}$/i).optional().parse(typeof request.query.periodId === "string" && request.query.periodId ? request.query.periodId : undefined);
    const data = await courseGradesReport(context, courseId, periodId);
    sendPdf(response, await renderCourseGradesPdf(data), `sirae-notas-curso-${data.course.label.replace(/\s+/g, "-")}.pdf`);
  } catch (error) { next(error); }
}
