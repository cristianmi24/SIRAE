import PDFDocument from "pdfkit";
import * as archiver from "archiver";
import type { NextFunction, Request, Response } from "express";
import { createQrDataUrl, createOpaqueQrToken, createQrPayload, hashQrPayload } from "../utils/qr.js";
import { requireAuthContext } from "../middleware/security.js";
import { createCourseGroup, courseGroupInputSchema, listCourseGroups } from "../services/course-groups.js";
import {
  createStudent,
  deactivateStudent,
  getStudent,
  getStudentQrStatus,
  listStudents,
  reactivateStudent,
  regenerateStudentQr,
  updateStudent,
} from "../services/students.js";
import { AppError } from "../utils/errors.js";
import { addEdutlanWatermark } from "../utils/pdf-branding.js";
import { deleteCourse, deleteEverything, deleteStudent } from "../services/cleanup.js";
import { studentInputSchema, studentListQuerySchema, studentUpdateSchema } from "../validators/students.js";
import { Student, AuditLog } from "../models/index.js";

function studentIdFromRequest(request: Request): string {
  const value = request.params.id;
  if (typeof value !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", "El identificador del estudiante no es válido.");
  }
  return value;
}

export async function listCourseGroupsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ items: await listCourseGroups(requireAuthContext(request)) });
  } catch (error) {
    next(error);
  }
}

export async function createCourseGroupController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const group = await createCourseGroup(requireAuthContext(request), courseGroupInputSchema.parse(request.body));
    response.status(201).json({ item: group });
  } catch (error) {
    next(error);
  }
}

export async function listStudentsController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json(await listStudents(requireAuthContext(request), studentListQuerySchema.parse(request.query)));
  } catch (error) {
    next(error);
  }
}

export async function createStudentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.status(201).json(await createStudent(requireAuthContext(request), studentInputSchema.parse(request.body)));
  } catch (error) {
    next(error);
  }
}

export async function getStudentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ item: await getStudent(requireAuthContext(request), studentIdFromRequest(request)) });
  } catch (error) {
    next(error);
  }
}

export async function updateStudentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ item: await updateStudent(requireAuthContext(request), studentIdFromRequest(request), studentUpdateSchema.parse(request.body)) });
  } catch (error) {
    next(error);
  }
}

export async function deactivateStudentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ item: await deactivateStudent(requireAuthContext(request), studentIdFromRequest(request)) });
  } catch (error) {
    next(error);
  }
}

export async function reactivateStudentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ item: await reactivateStudent(requireAuthContext(request), studentIdFromRequest(request)) });
  } catch (error) {
    next(error);
  }
}

export async function studentQrStatusController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json(await getStudentQrStatus(requireAuthContext(request), studentIdFromRequest(request)));
  } catch (error) {
    next(error);
  }
}

export async function regenerateStudentQrController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json(await regenerateStudentQr(requireAuthContext(request), studentIdFromRequest(request)));
  } catch (error) {
    next(error);
  }
}

function dataUrlBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

export async function exportStudentQrsController(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const context = requireAuthContext(request);
      const students = await Student.find({ institutionId: context.institution.id, active: true }).sort({ lastName: 1, firstName: 1 }).limit(10_000);
      if (!students.length) {
        response.status(404).json({ error: { code: "NO_STUDENTS", message: "No hay estudiantes activos para exportar." } });
        return;
      }
      const files: { name: string; studentName: string; document: string; image: Buffer }[] = [];
      for (const student of students) {
        const token = createOpaqueQrToken();
        student.qrTokenHash = hashQrPayload(createQrPayload(token));
        student.qrVersion += 1;
        await student.save();
        files.push({
          name: `QR-${student.firstName}-${student.lastName}-${student.document}`.replace(/[^a-zA-Z0-9_-]+/g, "-"),
          studentName: `${student.firstName} ${student.lastName}`,
          document: student.document,
          image: dataUrlBuffer(await createQrDataUrl(createQrPayload(token))),
        });
      }
      await AuditLog.create({
        institutionId: context.institution.id,
        actorUserId: context.user.id,
        action: "STUDENT_QR_BULK_EXPORTED",
        entityType: "STUDENT",
        entityId: students[0]._id,
        metadata: { count: files.length, format: request.query.format === "zip" ? "zip" : "pdf" },
      });
      if (request.query.format === "zip") {
        response.setHeader("Content-Type", "application/zip");
        response.setHeader("Content-Disposition", 'attachment; filename="aulanexo-codigos-qr.zip"');
        response.setHeader("Cache-Control", "private, no-store");
        const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
        archive.on("error", next);
        archive.pipe(response);
        for (const file of files) archive.append(file.image, { name: `${file.name}.png` });
        await archive.finalize();
        return;
      }
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", 'attachment; filename="sirae-codigos-qr.pdf"');
      response.setHeader("Cache-Control", "private, no-store");
      const document = new PDFDocument({ size: "LETTER", margin: 36, info: { Title: "Códigos QR de estudiantes", Author: "SIRAE" } });
      document.pipe(response);
      addEdutlanWatermark(document);
      files.forEach((file, index) => {
        if (index > 0 && index % 4 === 0) document.addPage();
        const position = index % 4;
        const x = 54 + (position % 2) * 270;
        const y = 60 + Math.floor(position / 2) * 340;
        document.fontSize(14).fillColor("#173F5F").text(file.studentName, x, y, { width: 230, align: "center" });
        document.fontSize(9).fillColor("#526174").text(`Código: ${file.document}`, x, y + 22, { width: 230, align: "center" });
        document.image(file.image, x + 35, y + 48, { fit: [160, 160], align: "center" });
      });
      document.end();
    } catch (error) {
      next(error);
  }
}

export async function deleteStudentController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await deleteStudent(requireAuthContext(request), studentIdFromRequest(request))); } catch (error) { next(error); }
}
export async function deleteCourseController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await deleteCourse(requireAuthContext(request), String(request.params.id))); } catch (error) { next(error); }
}
export async function deleteEverythingController(request: Request, response: Response, next: NextFunction): Promise<void> {
  try { response.json(await deleteEverything(requireAuthContext(request), String(request.body?.confirmation ?? ""))); } catch (error) { next(error); }
}
