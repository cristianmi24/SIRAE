import { uniqueStudentCode } from "../utils/student-code.js";
import { Types } from "mongoose";
import type { PaginatedResult, StudentDto } from "../../../shared/types.js";
import { AuditLog, CourseGroup, Enrollment, Student } from "../models/index.js";
import type { AuthContext } from "./auth-context.js";
import { AppError, conflict, notFound } from "../utils/errors.js";
import { createOpaqueQrToken, createQrDataUrl, createQrPayload, hashQrPayload } from "../utils/qr.js";
import { escapeRegex, normalizeForLookup } from "../utils/text.js";
import type { StudentInput, StudentListQuery, StudentUpdateInput } from "../validators/students.js";

interface QrDelivery {
  dataUrl: string;
  version: number;
  oneTimeNotice: string;
}

function studentId(value: string): Types.ObjectId {
  if (!/^[a-f\d]{24}$/i.test(value)) {
    throw new AppError(400, "VALIDATION_ERROR", "El identificador del estudiante no es válido.");
  }
  return new Types.ObjectId(value);
}

function hasOwnInput(input: StudentUpdateInput, key: keyof StudentUpdateInput): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

async function resolveCourseGroup(context: AuthContext, courseGroupId?: string): Promise<void> {
  if (context.membership.role !== "ADMIN" && (!courseGroupId || !context.membership.courseGroupIds.includes(courseGroupId))) {
    throw notFound("El grupo seleccionado no existe o no está asignado a tu cuenta.");
  }
  if (!courseGroupId) return;
  const courseGroup = await CourseGroup.exists({
    _id: courseGroupId,
    institutionId: context.institution.id,
    active: true,
  });
  if (!courseGroup) {
    throw notFound("El grupo seleccionado no existe o no está activo.");
  }
}

function assertStudentScope(context: AuthContext, student: { courseGroupId?: Types.ObjectId }): void {
  if (context.membership.role === "DOCENTE" && (!student.courseGroupId || !context.membership.courseGroupIds.includes(student.courseGroupId.toString()))) {
    throw notFound("No se encontró el estudiante solicitado.");
  }
}

async function mapStudent(student: any): Promise<StudentDto> {
  const courseGroup = student.courseGroupId
    ? await CourseGroup.findOne({ _id: student.courseGroupId, institutionId: student.institutionId }).lean()
    : undefined;

  return {
    id: student._id.toString(),
    firstName: student.firstName,
    lastName: student.lastName,
    fullName: `${student.firstName} ${student.lastName}`,
    document: student.document,
    courseGroup: courseGroup
      ? { id: courseGroup._id.toString(), label: `${courseGroup.grade} · ${courseGroup.group}` }
      : undefined,
    email: student.email,
    phone: student.phone,
    status: student.active ? "ACTIVO" : "INACTIVO",
    qrVersion: student.qrVersion,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
  };
}

async function audit(
  context: AuthContext,
  action: string,
  entityId: Types.ObjectId,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): Promise<void> {
  await AuditLog.create({
    institutionId: context.institution.id,
    actorUserId: context.user.id,
    action,
    entityType: "STUDENT",
    entityId,
    before,
    after,
  });
}

async function newQrDelivery(token: string, version: number): Promise<QrDelivery> {
  return {
    dataUrl: await createQrDataUrl(createQrPayload(token)),
    version,
    oneTimeNotice:
      "Este QR se muestra una sola vez. Descárgalo o imprímelo ahora; para volver a emitirlo, usa Regenerar QR.",
  };
}

export async function listStudents(
  context: AuthContext,
  query: StudentListQuery,
): Promise<PaginatedResult<StudentDto>> {
  const filter: Record<string, unknown> = { institutionId: context.institution.id };
  if (context.membership.role === "DOCENTE") filter.courseGroupId = { $in: context.membership.courseGroupIds };
  if (query.status !== "TODOS") filter.active = query.status === "ACTIVO";
  if (query.courseGroupId) {
    if (context.membership.role === "DOCENTE" && !context.membership.courseGroupIds.includes(query.courseGroupId)) filter.courseGroupId = { $in: [] };
    else filter.courseGroupId = query.courseGroupId;
  }
  if (query.search) {
    const expression = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ firstName: expression }, { lastName: expression }, { document: expression }];
  }

  const [total, students] = await Promise.all([
    Student.countDocuments(filter),
    Student.find(filter)
      .sort({ lastName: 1, firstName: 1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize),
  ]);

  return {
    items: await Promise.all(students.map(mapStudent)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getStudent(context: AuthContext, id: string): Promise<StudentDto> {
  const student = await Student.findOne({ _id: studentId(id), institutionId: context.institution.id });
  if (!student) throw notFound("No se encontró el estudiante solicitado.");
  assertStudentScope(context, student);
  return mapStudent(student);
}

export async function createStudent(
  context: AuthContext,
  input: StudentInput,
): Promise<{ student: StudentDto; qr: QrDelivery }> {
  await resolveCourseGroup(context, input.courseGroupId);
  const token = createOpaqueQrToken();
  const payload = createQrPayload(token);
  // Sin documento de identidad: el sistema asigna un código alfanumérico único.
  const code = input.document?.trim() ? input.document.trim().toUpperCase() : await uniqueStudentCode(context.institution.id);
  const documentNormalized = normalizeForLookup(code);

  const existing = await Student.exists({
    institutionId: context.institution.id,
    documentNormalized,
  });
  if (existing) throw conflict("Ya existe un estudiante con ese código.");

  const student = await Student.create({
    institutionId: context.institution.id,
    firstName: input.firstName,
    lastName: input.lastName,
    document: code,
    documentNormalized,
    courseGroupId: input.courseGroupId,
    email: input.email || undefined,
    phone: input.phone || undefined,
    active: true,
    qrTokenHash: hashQrPayload(payload),
    qrVersion: 1,
    createdBy: context.user.id,
  });

  if (student.courseGroupId) {
    await Enrollment.create({
      institutionId: context.institution.id,
      studentId: student._id,
      courseGroupId: student.courseGroupId,
      startsOn: new Date(),
      active: true,
    });
  }

  await audit(context, "STUDENT_CREATED", student._id, undefined, {
    document: student.document,
    status: "ACTIVO",
  });

  return { student: await mapStudent(student), qr: await newQrDelivery(token, 1) };
}

export async function updateStudent(
  context: AuthContext,
  id: string,
  input: StudentUpdateInput,
): Promise<StudentDto> {
  const student = await Student.findOne({ _id: studentId(id), institutionId: context.institution.id });
  if (!student) throw notFound("No se encontró el estudiante solicitado.");
  assertStudentScope(context, student);

  const includesCourseGroup = hasOwnInput(input, "courseGroupId");
  if (includesCourseGroup && context.membership.role === "DOCENTE" && !input.courseGroupId) {
    throw notFound("Un docente no puede quitar la asignación de grupo del estudiante.");
  }
  if (includesCourseGroup && input.courseGroupId) {
    await resolveCourseGroup(context, input.courseGroupId);
  }

  const previousCourseGroupId = student.courseGroupId?.toString();
  const nextCourseGroupId = includesCourseGroup ? input.courseGroupId || undefined : previousCourseGroupId;
  const courseGroupChanged = includesCourseGroup && previousCourseGroupId !== nextCourseGroupId;
  const before = {
    document: student.document,
    status: student.active ? "ACTIVO" : "INACTIVO",
    courseGroupId: previousCourseGroupId,
  };

  if (hasOwnInput(input, "firstName") && input.firstName) student.firstName = input.firstName;
  if (hasOwnInput(input, "lastName") && input.lastName) student.lastName = input.lastName;
  if (hasOwnInput(input, "document") && input.document) {
    student.document = input.document;
    student.documentNormalized = normalizeForLookup(input.document);
  }
  if (includesCourseGroup) {
    student.courseGroupId = nextCourseGroupId ? new Types.ObjectId(nextCourseGroupId) : undefined;
  }
  if (hasOwnInput(input, "email")) student.email = input.email || undefined;
  if (hasOwnInput(input, "phone")) student.phone = input.phone || undefined;

  try {
    await student.save();
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: number }).code === 11000) {
      throw conflict("Ya existe un estudiante con ese documento o código institucional.");
    }
    throw error;
  }

  if (courseGroupChanged) {
    const changedAt = new Date();
    await Enrollment.updateMany(
      { institutionId: context.institution.id, studentId: student._id, active: true },
      { $set: { active: false, endsOn: changedAt } },
    );
    if (student.courseGroupId) {
      await Enrollment.create({
        institutionId: context.institution.id,
        studentId: student._id,
        courseGroupId: student.courseGroupId,
        startsOn: changedAt,
        active: true,
      });
    }
  }

  await audit(context, "STUDENT_UPDATED", student._id, before, {
    document: student.document,
    status: student.active ? "ACTIVO" : "INACTIVO",
    courseGroupId: student.courseGroupId?.toString(),
  });
  return mapStudent(student);
}

export async function deactivateStudent(context: AuthContext, id: string): Promise<StudentDto> {
  const student = await Student.findOne({ _id: studentId(id), institutionId: context.institution.id });
  if (!student) throw notFound("No se encontró el estudiante solicitado.");
  assertStudentScope(context, student);
  if (!student.active) return mapStudent(student);

  const changedAt = new Date();
  student.active = false;
  const oldQrVersion = student.qrVersion;
  student.qrTokenHash = hashQrPayload(createQrPayload(createOpaqueQrToken()));
  student.qrVersion += 1;
  await student.save();
  await Enrollment.updateMany(
    { institutionId: context.institution.id, studentId: student._id, active: true },
    { $set: { active: false, endsOn: changedAt } },
  );
  await audit(context, "STUDENT_DEACTIVATED", student._id, { status: "ACTIVO", qrVersion: oldQrVersion }, { status: "INACTIVO", qrVersion: student.qrVersion });
  return mapStudent(student);
}

export async function reactivateStudent(context: AuthContext, id: string): Promise<StudentDto> {
  const student = await Student.findOne({ _id: studentId(id), institutionId: context.institution.id });
  if (!student) throw notFound("No se encontró el estudiante solicitado.");
  assertStudentScope(context, student);
  if (student.active) return mapStudent(student);
  if (student.courseGroupId) await resolveCourseGroup(context, student.courseGroupId.toString());
  student.active = true;
  await student.save();
  if (student.courseGroupId) {
    await Enrollment.create({ institutionId: context.institution.id, studentId: student._id, courseGroupId: student.courseGroupId, startsOn: new Date(), active: true });
  }
  await audit(context, "STUDENT_REACTIVATED", student._id, { status: "INACTIVO" }, { status: "ACTIVO", courseGroupId: student.courseGroupId?.toString() });
  return mapStudent(student);
}

export async function regenerateStudentQr(
  context: AuthContext,
  id: string,
): Promise<{ student: StudentDto; qr: QrDelivery }> {
  const student = await Student.findOne({ _id: studentId(id), institutionId: context.institution.id });
  if (!student) throw notFound("No se encontró el estudiante solicitado.");
  assertStudentScope(context, student);
  if (!student.active) throw new AppError(409, "STUDENT_INACTIVE", "Reactiva al estudiante antes de generar un nuevo QR.");

  const token = createOpaqueQrToken();
  const payload = createQrPayload(token);
  const oldVersion = student.qrVersion;
  student.qrTokenHash = hashQrPayload(payload);
  student.qrVersion += 1;
  await student.save();
  await audit(context, "STUDENT_QR_REGENERATED", student._id, { qrVersion: oldVersion }, { qrVersion: student.qrVersion });

  return { student: await mapStudent(student), qr: await newQrDelivery(token, student.qrVersion) };
}

export async function getStudentQrStatus(context: AuthContext, id: string) {
  const student = await Student.findOne({ _id: studentId(id), institutionId: context.institution.id });
  if (!student) throw notFound("No se encontró el estudiante solicitado.");
  assertStudentScope(context, student);
  return {
    qrVersion: student.qrVersion,
    requiresRegeneration: true,
    message:
      "Por privacidad, el QR no se conserva en texto recuperable. Regénéralo para volver a mostrarlo o imprimirlo.",
  };
}
