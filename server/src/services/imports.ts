import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { fileTypeFromBuffer } from "file-type";
import { Types } from "mongoose";
import { ImportJob, Subject } from "../models/learning.js";
import { CourseGroup, Enrollment, Institution, Student } from "../models/index.js";
import type { AuthContext } from "./auth-context.js";
import { actorId, audit, objectId, tenantId } from "./learning-common.js";
import { normalizeForLookup } from "../utils/text.js";
import { normalizeStudentCode, uniqueStudentCode } from "../utils/student-code.js";
import { createOpaqueQrToken, createQrPayload, hashQrPayload } from "../utils/qr.js";
import { AppError } from "../utils/errors.js";

export interface ImportUpload { buffer: Buffer; originalname: string; mimetype: string; size: number }
const maxSize = 5 * 1024 * 1024;
const maxRows = 1200;
const aliases: Record<string, string[]> = {
  firstName: ["nombre", "nombres", "firstname", "first_name"], lastName: ["apellido", "apellidos", "lastname", "last_name"], document: ["codigo", "código", "code"], grade: ["curso", "grado", "grade"], group: ["grupo", "group"], email: ["correo", "email", "correo electronico"], phone: ["telefono", "contacto", "phone"], subject: ["asignatura", "asignaturas", "materia", "materias", "subject"],
};
const fieldsByKind = { students: ["firstName", "lastName", "grade", "group", "subject", "document"] } as const;
function normalizeHeader(value: unknown): string { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[_-]+/g, " "); }
function autoMapping(kind: "students", headers: string[]) {
  const result: Record<string, string> = {};
  for (const field of fieldsByKind[kind]) {
    const candidates = aliases[field] ?? [];
    const header = headers.find((value) => candidates.includes(normalizeHeader(value)));
    if (header) result[field] = header;
  }
  return result;
}
function validateXlsxArchive(buffer: Buffer): void {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) throw new AppError(400, "FILE_CORRUPT", "El archivo XLSX no contiene un directorio ZIP válido.");
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (eocd + 22 + commentLength !== buffer.length) throw new AppError(400, "FILE_CORRUPT", "El cierre del archivo XLSX no es válido.");
  const entries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (entries < 2 || entries > 200 || centralOffset + centralSize > eocd || entries === 0xffff || centralOffset === 0xffffffff) throw new AppError(400, "FILE_CORRUPT", "El libro XLSX tiene una estructura no admitida o demasiadas entradas.");
  let cursor = centralOffset; let totalUncompressed = 0; const names = new Set<string>();
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > centralOffset + centralSize || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new AppError(400, "FILE_CORRUPT", "El índice interno del libro XLSX está dañado.");
    const flags = buffer.readUInt16LE(cursor + 8); const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20); const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28); const extraLength = buffer.readUInt16LE(cursor + 30); const fileCommentLength = buffer.readUInt16LE(cursor + 32);
    if ([compressedSize, uncompressedSize].includes(0xffffffff) || (flags & 1) !== 0 || ![0, 8].includes(method) || cursor + 46 + nameLength + extraLength + fileCommentLength > centralOffset + centralSize) throw new AppError(400, "FILE_CORRUPT", "El XLSX usa cifrado o un formato de compresión no admitido.");
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(cursor + 46, cursor + 46 + nameLength)); }
    catch { throw new AppError(400, "FILE_CORRUPT", "El índice interno del XLSX tiene nombres de archivo inválidos."); }
    if (name.startsWith("/") || name.split(/[\\/]/).includes("..") || names.has(name)) throw new AppError(400, "FILE_CORRUPT", "El libro XLSX contiene una ruta interna inválida o repetida.");
    names.add(name); totalUncompressed += uncompressedSize;
    if (uncompressedSize > 12 * 1024 * 1024 || totalUncompressed > 25 * 1024 * 1024 || (uncompressedSize > 1024 * 1024 && uncompressedSize / Math.max(compressedSize, 1) > 100)) throw new AppError(413, "XLSX_EXPANSION_LIMIT", "El XLSX supera el límite seguro de expansión de contenido.");
    cursor += 46 + nameLength + extraLength + fileCommentLength;
  }
  if (cursor !== centralOffset + centralSize || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) throw new AppError(400, "FILE_CORRUPT", "El archivo ZIP no parece ser un libro XLSX válido.");
}
async function parseFile(file: ImportUpload): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  if (file.size > maxSize || file.buffer.length > maxSize) throw new AppError(413, "FILE_TOO_LARGE", "El archivo supera el límite de 5 MB.");
  const extension = path.extname(file.originalname).toLowerCase();
  let rows: string[][];
  if (extension === ".csv") {
    if (!["text/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream"].includes(file.mimetype)) throw new AppError(400, "INVALID_FILE_TYPE", "El tipo del archivo CSV no coincide con su extensión.");
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(file.buffer);
      if (text.includes("\0")) throw new Error("Binary CSV");
      rows = parseCsv(text, { bom: true, skip_empty_lines: true, trim: true, relax_column_count: false, max_record_size: 20_000 }) as string[][];
    }
    catch { throw new AppError(400, "FILE_CORRUPT", "El CSV está dañado o contiene filas con columnas inconsistentes."); }
  } else if (extension === ".xlsx") {
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || (detected && !["application/zip", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(detected.mime))) throw new AppError(400, "INVALID_FILE_TYPE", "El contenido del archivo no es un libro XLSX válido.");
    validateXlsxArchive(file.buffer);
    try {
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file.buffer as never);
      const sheet = workbook.worksheets[0];
      if (!sheet || sheet.rowCount > maxRows + 1 || sheet.columnCount > 50) throw new AppError(400, "SHEET_LIMIT", "La hoja debe tener como máximo 1.200 filas y 50 columnas.");
      rows = [];
      for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
        const row = sheet.getRow(rowIndex);
        rows.push(Array.from({ length: sheet.columnCount }, (_, col) => row.getCell(col + 1).text.trim()));
      }
    } catch (error) { if (error instanceof AppError) throw error; throw new AppError(400, "FILE_CORRUPT", "No se pudo leer la hoja XLSX. Comprueba que no esté dañada."); }
  } else throw new AppError(400, "INVALID_FILE_TYPE", "Elige un archivo .CSV o .XLSX.");
  if (rows.length < 2) throw new AppError(400, "FILE_EMPTY", "El archivo debe contener encabezados y al menos una fila.");
  if (rows.length > maxRows + 1 || rows[0]!.length > 50) throw new AppError(400, "SHEET_LIMIT", "El archivo debe tener como máximo 1.200 filas y 50 columnas.");
  const headers = rows[0]!.map((x) => String(x ?? "").trim());
  if (headers.some((x) => !x) || new Set(headers.map(normalizeHeader)).size !== headers.length) throw new AppError(400, "INVALID_HEADERS", "Los encabezados deben tener nombre y no repetirse.");
  const data = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, i) => [header, String(row[i] ?? "").trim().slice(0, 4000)])));
  return { headers, rows: data };
}
export async function parseImportUpload(file: ImportUpload): Promise<{ headers: string[]; rows: Record<string, string>[] }> { return parseFile(file); }
function mappedValue(row: Record<string, string>, mapping: Record<string, string>, field: string): string { return String(row[mapping[field] ?? ""] ?? "").trim(); }
type NewCourse = { key: string; grade: string; group: string };
const courseKey = (grade: string, group: string) => `${normalizeForLookup(grade)}|${normalizeForLookup(group)}`;
async function validateRows(context: AuthContext, kind: "students", rows: Record<string, string>[], mapping: Record<string, string>) {
  const errors: { row: number; field: string; message: string }[] = [];
  const candidates: Record<string, unknown>[] = [];
  const isAdmin = context.membership.role === "ADMIN";
  const groups = await CourseGroup.find({ institutionId: tenantId(context), active: true, ...(isAdmin ? {} : { _id: { $in: context.membership.courseGroupIds.map((id) => objectId(id)) } }) }).lean();
  const groupMap = new Map(groups.map((g) => [`${g.gradeNormalized}|${g.groupNormalized}`, g._id]));
  // Los cursos que aún no existen se crean al confirmar la importación (solo administradores).
  const newCourses = new Map<string, NewCourse>();
  // Asignaturas: se crean si no existen y se vinculan al curso de la fila.
  const subjectRows = await Subject.find({ institutionId: tenantId(context), active: true }).select("name courseGroupIds").lean();
  const subjectMap = new Map(subjectRows.map((row) => [normalizeForLookup(row.name), row]));
  const subjectLinks = new Map<string, { name: string; courseKeys: Set<string> }>();
  const seen = new Set<string>(); const duplicateKeys = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const source = rows[i]!; const line = i + 2;
    const firstName = mappedValue(source, mapping, "firstName"); const lastName = mappedValue(source, mapping, "lastName"); const document = mappedValue(source, mapping, "document");
    const grade = mappedValue(source, mapping, "grade"); const group = mappedValue(source, mapping, "group"); 
    let invalid = false;
    if (!isAdmin && (!grade || !group)) { errors.push({ row: line, field: "group", message: "Escribe el curso y el grupo; deben ser cursos asignados a tu cuenta." }); invalid = true; }
    for (const [field, value, label] of [["firstName", firstName, "Falta el nombre."], ["lastName", lastName, "Falta el apellido."], ] as const) if (!value) { errors.push({ row: line, field, message: label }); invalid = true; }
    let courseGroupId: Types.ObjectId | undefined; let newCourseKey: string | undefined;
    if (grade || group) {
      if (!grade || !group) { errors.push({ row: line, field: "group", message: "Escribe curso y grupo juntos (por ejemplo: curso 8, grupo A)." }); invalid = true; }
      else if (grade.length > 64 || group.length > 32) { errors.push({ row: line, field: "group", message: "El curso o el grupo es demasiado largo." }); invalid = true; }
      else {
        const key = courseKey(grade, group);
        courseGroupId = groupMap.get(key);
        if (!courseGroupId) {
          if (isAdmin) { newCourseKey = key; if (!newCourses.has(key)) newCourses.set(key, { key, grade, group }); }
          else { errors.push({ row: line, field: "group", message: `El curso "${grade} ${group}" no está asignado a tu cuenta.` }); invalid = true; }
        }
      }
    }
    const subjectNames = [...new Set(mappedValue(source, mapping, "subject").split(/[;,/]/).map((x) => x.trim()).filter(Boolean))];
    if (subjectNames.length && !(grade && group)) { errors.push({ row: line, field: "subject", message: "Para vincular la asignatura escribe también el curso y el grupo." }); invalid = true; }
    for (const subjectName of subjectNames) {
      if (subjectName.length > 100) { errors.push({ row: line, field: "subject", message: "El nombre de la asignatura es demasiado largo." }); invalid = true; continue; }
      if (!isAdmin && !subjectMap.has(normalizeForLookup(subjectName))) { errors.push({ row: line, field: "subject", message: `La asignatura "${subjectName}" no existe; pídele al administrador que la cree.` }); invalid = true; }
    }
    if (!invalid && grade && group) for (const subjectName of subjectNames) {
      const key = normalizeForLookup(subjectName);
      const link = subjectLinks.get(key) ?? { name: subjectMap.get(key)?.name ?? subjectName, courseKeys: new Set<string>() };
      link.courseKeys.add(courseKey(grade, group)); subjectLinks.set(key, link);
    }
    const normalized = document ? normalizeStudentCode(document) : `NOMBRE:${normalizeForLookup(`${firstName} ${lastName}`)}|${grade && group ? courseKey(grade, group) : "-"}`;
    if (!invalid && normalized) { if (seen.has(normalized)) duplicateKeys.add(normalized); seen.add(normalized); candidates.push({ row: line, firstName, lastName, document: document ? normalizeStudentCode(document) : "", normalized, courseGroupId, newCourseKey }); }
  }
  if (candidates.length) {
    const docs = candidates.filter((x) => x.document).map((x) => String(x.normalized));
    const existing = docs.length ? await Student.find({ institutionId: tenantId(context), documentNormalized: { $in: docs } }).select("documentNormalized").lean() : [];
    existing.forEach((x) => duplicateKeys.add(x.documentNormalized));
    // Sin código en el archivo, un estudiante ya existe si coincide nombre completo y curso.
    const groupKeyById = new Map(groups.map((g) => [String(g._id), `${g.gradeNormalized}|${g.groupNormalized}`]));
    const named = await Student.find({ institutionId: tenantId(context) }).select("firstName lastName courseGroupId").lean();
    for (const row of named) duplicateKeys.add(`NOMBRE:${normalizeForLookup(`${row.firstName} ${row.lastName}`)}|${row.courseGroupId ? groupKeyById.get(String(row.courseGroupId)) ?? "?" : "-"}`);
  }
  const duplicateCount = candidates.filter((x) => duplicateKeys.has(String(x.normalized))).length;
  const uniqueCandidates = candidates.filter((x) => !duplicateKeys.has(String(x.normalized)));
  const usedNewKeys = new Set(uniqueCandidates.map((x) => x.newCourseKey).filter(Boolean));
  const coursesToCreate = [...newCourses.values()].filter((course) => usedNewKeys.has(course.key));
  if (coursesToCreate.length) {
    const institution = await Institution.findById(context.institution.id).select("type").lean();
    if (institution?.type === "PERSONAL" && groups.length + coursesToCreate.length > 6) throw new AppError(409, "COURSE_LIMIT", `Tu aula personal permite máximo 6 cursos. Ya tienes ${groups.length} y el archivo crearía ${coursesToCreate.length} nuevos.`);
  }
  const creatableKeys = new Set([...groupMap.keys(), ...coursesToCreate.map((course) => course.key)]);
  const subjectPlan = [...subjectLinks.entries()].map(([key, link]) => ({ key, name: link.name, existingId: subjectMap.get(key)?._id, courseKeys: [...link.courseKeys].filter((courseKeyValue) => creatableKeys.has(courseKeyValue)) })).filter((plan) => plan.courseKeys.length);
  const summary = { found: rows.length, valid: uniqueCandidates.length, duplicates: duplicateCount, errors: new Set(errors.map((item) => item.row)).size };
  return { summary, errors, candidates: uniqueCandidates, newCourses: coursesToCreate.map((course) => `${course.grade} ${course.group}`), coursesToCreate, newSubjects: subjectPlan.filter((plan) => !plan.existingId).map((plan) => plan.name), subjectPlan, groupMap };
}
async function applySubjects(context: AuthContext, plans: { key: string; name: string; existingId?: Types.ObjectId; courseKeys: string[] }[], courseIds: Map<string, Types.ObjectId>) {
  let linked = 0;
  for (const plan of plans) {
    const ids = plan.courseKeys.map((key) => courseIds.get(key)).filter((id): id is Types.ObjectId => Boolean(id));
    if (!ids.length) continue;
    if (plan.existingId) {
      const result = await Subject.updateOne({ _id: plan.existingId, institutionId: tenantId(context) }, { $addToSet: { courseGroupIds: { $each: ids } } });
      linked += result.modifiedCount;
    } else {
      const row = await Subject.create({ institutionId: tenantId(context), name: plan.name, courseGroupIds: ids, createdBy: actorId(context) });
      await audit(context, "SUBJECT_CREATED_FROM_IMPORT", "Subject", row._id, undefined, { name: row.name, courses: ids.length });
    }
  }
  return linked;
}
async function createMissingCourses(context: AuthContext, courses: NewCourse[]) {
  const academicYear = new Date().getFullYear();
  const created = new Map<string, Types.ObjectId>();
  for (const course of courses) {
    const [gradeNormalized, groupNormalized] = course.key.split("|") as [string, string];
    const existing = await CourseGroup.findOne({ institutionId: tenantId(context), gradeNormalized, groupNormalized, active: true }).select("_id").lean();
    if (existing) { created.set(course.key, existing._id); continue; }
    const row = await CourseGroup.create({ institutionId: tenantId(context), grade: course.grade, gradeNormalized, group: course.group, groupNormalized, academicYear, active: true });
    created.set(course.key, row._id);
    await audit(context, "COURSE_GROUP_CREATED_FROM_IMPORT", "CourseGroup", row._id, undefined, { grade: row.grade, group: row.group, academicYear });
  }
  return created;
}
export async function previewImport(context: AuthContext, kind: "students", file: ImportUpload) {
  const parsed = await parseFile(file); const mapping = autoMapping(kind, parsed.headers);
  const checked = await validateRows(context, kind, parsed.rows, mapping);
  const job = await ImportJob.create({ institutionId: tenantId(context), createdBy: actorId(context), kind, state: "PREVIEW", rows: parsed.rows, headers: parsed.headers, mapping, summary: checked.summary, rowErrors: checked.errors });
  return { id: String(job._id), kind, headers: parsed.headers, mapping, summary: checked.summary, errors: checked.errors, newCourses: checked.newCourses, newSubjects: checked.newSubjects, preview: parsed.rows.slice(0, 10) };
}
export async function remapImport(context: AuthContext, jobId: string, mapping: Record<string, string>) {
  const job = await ImportJob.findOne({ _id: objectId(jobId), institutionId: tenantId(context), state: "PREVIEW" });
  if (!job) throw new AppError(404, "IMPORT_NOT_FOUND", "La previsualización ya expiró o no existe.");
  for (const [field, header] of Object.entries(mapping)) if (!(fieldsByKind.students as readonly string[]).includes(field) || !job.headers.includes(header)) throw new AppError(400, "INVALID_MAPPING", "El mapeo contiene una columna no válida.");
  job.mapping = mapping; const rows = job.rows as Record<string, string>[];
  const checked = await validateRows(context, "students", rows, mapping); job.summary = checked.summary; job.rowErrors = checked.errors; await job.save();
  return { id: String(job._id), kind: job.kind, headers: job.headers, mapping, summary: checked.summary, errors: checked.errors, newCourses: checked.newCourses, newSubjects: checked.newSubjects, preview: rows.slice(0, 10) };
}
export async function confirmImport(context: AuthContext, jobId: string) {
  const job = await ImportJob.findOne({ _id: objectId(jobId), institutionId: tenantId(context), state: "PREVIEW" });
  if (!job) throw new AppError(404, "IMPORT_NOT_FOUND", "La vista previa ya fue confirmada o expiró. Vuelve a subir el archivo.");
  const checked = await validateRows(context, "students", job.rows as Record<string, string>[], job.mapping);
  const createdCourses = await createMissingCourses(context, checked.coursesToCreate);
  await applySubjects(context, checked.subjectPlan, new Map([...checked.groupMap, ...createdCourses]));
  let created = 0;
  // Cada estudiante recibe un código alfanumérico único en lugar de un documento de identidad.
  const reserved = new Set<string>();
  const docs = [];
  for (const x of checked.candidates) {
    const code = x.document ? String(x.document) : await uniqueStudentCode(tenantId(context), reserved);
    const groupId = (x.courseGroupId as Types.ObjectId | undefined) ?? (x.newCourseKey ? createdCourses.get(String(x.newCourseKey)) : undefined);
    docs.push({ institutionId: tenantId(context), firstName: x.firstName, lastName: x.lastName, document: code, documentNormalized: code, courseGroupId: groupId, active: true, qrTokenHash: hashQrPayload(createQrPayload(createOpaqueQrToken())), qrVersion: 1, createdBy: actorId(context) });
  }
  if (docs.length) {
    try { const inserted = await Student.insertMany(docs, { ordered: false }); created = inserted.length; const enrollments = inserted.filter((x) => x.courseGroupId).map((x) => ({ institutionId: tenantId(context), studentId: x._id, courseGroupId: x.courseGroupId!, startsOn: new Date(), active: true })); if (enrollments.length) await Enrollment.insertMany(enrollments, { ordered: false }); }
    catch (error) { created = Number((error as { insertedDocs?: unknown[] }).insertedDocs?.length ?? 0); }
  }
  job.state = "CONFIRMED"; job.summary = checked.summary; job.rowErrors = checked.errors; await job.save();
  await audit(context, "IMPORT_CONFIRMED", "ImportJob", job._id, undefined, { kind: job.kind, found: checked.summary.found, created, coursesCreated: createdCourses.size, duplicates: checked.summary.duplicates, errors: checked.summary.errors });
  const coursesText = `${checked.newCourses.length ? ` Se crearon los cursos: ${checked.newCourses.join(", ")}.` : ""}${checked.newSubjects.length ? ` Se crearon las asignaturas: ${checked.newSubjects.join(", ")}.` : ""}`;
  return { created, summary: checked.summary, errors: checked.errors, message: `${created} estudiantes cargados.${coursesText}${checked.summary.duplicates ? ` ${checked.summary.duplicates} ya existían.` : ""}${checked.summary.errors ? ` ${checked.summary.errors} filas con errores no se cargaron.` : ""}` };
}
