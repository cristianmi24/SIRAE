import { Attendance, ClassSession, Schedule } from "../models/learning.js";
import { Enrollment, Student } from "../models/index.js";
import type { AuthContext } from "./auth-context.js";
import { actorId, assertGroupAccess, audit, forbiddenEntity, objectId, tenantId } from "./learning-common.js";
import { AppError } from "../utils/errors.js";
import { classifyPunctuality, isWithinAttendanceWindow } from "../utils/school-time.js";

function statusLabel(status: string): string { return ({ PRESENT: "A tiempo", LATE: "Tarde", ABSENT: "Ausente", JUSTIFIED: "Justificada", PENDING_REVIEW: "Revisión pendiente" } as Record<string,string>)[status] ?? status; }
export async function scanQr(context: AuthContext, input: { classSessionId: string; tokenHash: string; clientEventId?: string; deviceScannedAt?: string }) {
  const session = await ClassSession.findOne({ _id: objectId(input.classSessionId), institutionId: tenantId(context) });
  if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "No se encontró la sesión seleccionada.");
  assertGroupAccess(context, String(session.courseGroupId));
  if (session.state !== "OPEN" && !input.deviceScannedAt) throw new AppError(409, "SESSION_CLOSED", "La sesión ya está cerrada. Registra la corrección manual con su motivo.");
  const student = await Student.findOne({ institutionId: tenantId(context), qrTokenHash: input.tokenHash.toLowerCase(), active: true });
  if (!student) throw new AppError(404, "QR_NOT_FOUND", "El QR no es válido o el estudiante está inactivo.");
  if (!student.courseGroupId?.equals(session.courseGroupId)) throw new AppError(409, "STUDENT_NOT_IN_GROUP", "El estudiante no está inscrito en el grupo de esta sesión.");
  const first = await Attendance.findOne({ institutionId: tenantId(context), classSessionId: session._id, studentId: student._id });
  const serverNow = new Date();
  if (first) {
    if (input.deviceScannedAt && first.status === "ABSENT" && first.source === "SESSION_CLOSE") {
      const updated = await Attendance.findOneAndUpdate({ _id: first._id, source: "SESSION_CLOSE" }, { $set: { status: "PENDING_REVIEW", source: "OFFLINE", deviceScannedAt: new Date(input.deviceScannedAt), recordedAt: serverNow, clientEventId: input.clientEventId, requiresReview: true, updatedBy: actorId(context) } }, { new: true });
      if (updated) {
        await audit(context, "ATTENDANCE_OFFLINE_PENDING_REVIEW", "Attendance", updated._id, { status: "ABSENT", source: "SESSION_CLOSE" }, { status: updated.status, source: updated.source, deviceScannedAt: input.deviceScannedAt });
        return { duplicate: false, message: `${student.firstName} ${student.lastName} — escaneo offline sincronizado tras el cierre; revisión docente requerida. Hora de sincronización ${serverNow.toISOString()}`, item: { id: String(updated._id), studentId: String(student._id), studentName: `${student.firstName} ${student.lastName}`, status: updated.status, label: statusLabel(updated.status), recordedAt: serverNow.toISOString(), source: updated.source, requiresReview: true } };
      }
    }
    const latest = await Attendance.findOne({ institutionId: tenantId(context), classSessionId: session._id, studentId: student._id }) ?? first;
    return { duplicate: true, message: `La asistencia de ${student.firstName} ${student.lastName} ya está registrada.`, item: { studentId: String(student._id), studentName: `${student.firstName} ${student.lastName}`, status: latest.status, label: statusLabel(latest.status), recordedAt: latest.recordedAt?.toISOString(), source: latest.source } };
  }
  if (!input.deviceScannedAt && !isWithinAttendanceWindow(serverNow, session.startsAt, session.endsAt)) {
    const beforeStart = serverNow.getTime() < session.startsAt.getTime();
    throw new AppError(409, beforeStart ? "SESSION_NOT_STARTED" : "ATTENDANCE_WINDOW_CLOSED", beforeStart ? "La clase aún no ha comenzado según el horario. Usa «Empezar desde ahora» si hoy la clase inicia antes." : "Ya pasó la hora de esta clase. Usa «Empezar desde ahora» para tomar asistencia hoy o márcala a mano.");
  }
  const schedule = await Schedule.findOne({ _id: session.scheduleId, institutionId: tenantId(context) });
  if (!schedule) throw new AppError(409, "SCHEDULE_NOT_FOUND", "No se encontró el horario de esta sesión.");
  const punctuality = classifyPunctuality(serverNow, session.startsAt, session.toleranceMinutes ?? schedule.toleranceMinutes);
  const status = input.deviceScannedAt ? "PENDING_REVIEW" : punctuality;
  try {
    const row = await Attendance.create({ institutionId: tenantId(context), classSessionId: session._id, studentId: student._id, courseGroupId: session.courseGroupId, subjectId: session.subjectId, teacherUserId: session.teacherUserId, status, recordedAt: serverNow, source: input.deviceScannedAt ? "OFFLINE" : "QR", deviceScannedAt: input.deviceScannedAt ? new Date(input.deviceScannedAt) : undefined, requiresReview: Boolean(input.deviceScannedAt), clientEventId: input.clientEventId, updatedBy: actorId(context) });
    await audit(context, "ATTENDANCE_RECORDED", "Attendance", row._id, undefined, { classSessionId: String(session._id), studentId: String(student._id), status }, { source: row.source, requiresReview: row.requiresReview });
    return { duplicate: false, message: input.deviceScannedAt ? `${student.firstName} ${student.lastName} — escaneo offline pendiente de revisión docente — hora sincronizada ${serverNow.toISOString()}` : `${student.firstName} ${student.lastName}: ${statusLabel(status)} a las ${serverNow.toLocaleTimeString("es-CO", { timeZone: context.institution.timezone, hour: "2-digit", minute: "2-digit" })}`, item: { id: String(row._id), studentId: String(student._id), studentName: `${student.firstName} ${student.lastName}`, status, label: statusLabel(status), recordedAt: serverNow.toISOString(), source: row.source, requiresReview: row.requiresReview } };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: number }).code === 11000) {
      const row = await Attendance.findOne({ institutionId: tenantId(context), classSessionId: session._id, studentId: student._id });
      return { duplicate: true, message: `La asistencia de ${student.firstName} ${student.lastName} ya está registrada.`, item: { studentId: String(student._id), studentName: `${student.firstName} ${student.lastName}`, status: row?.status, label: row ? statusLabel(row.status) : "Registrada", recordedAt: row?.recordedAt?.toISOString() } };
    }
    throw error;
  }
}
export async function listSessionAttendance(context: AuthContext, sessionId: string) {
  const session = await ClassSession.findOne({ _id: objectId(sessionId), institutionId: tenantId(context) });
  if (!session) throw forbiddenEntity();
  assertGroupAccess(context, String(session.courseGroupId));
  const roster = await Enrollment.find({ institutionId: tenantId(context), courseGroupId: session.courseGroupId, active: true }).populate({ path: "studentId", match: { active: true }, select: "firstName lastName document" }).lean();
  const recorded = await Attendance.find({ institutionId: tenantId(context), classSessionId: session._id }).lean();
  const byStudent = new Map(recorded.map((x) => [String(x.studentId), x]));
  const items = roster.filter((x) => x.studentId).map((x) => {
    const student = x.studentId as unknown as { _id: { toString: () => string }; firstName: string; lastName: string; document: string };
    const row = byStudent.get(String(student._id));
    return { studentId: String(student._id), studentName: `${student.firstName} ${student.lastName}`, document: student.document, status: row?.status ?? (session.state === "CLOSED" ? "ABSENT" : "PENDING_REVIEW"), label: row ? statusLabel(row.status) : session.state === "CLOSED" ? "Ausente" : "Pendiente", recordedAt: row?.recordedAt?.toISOString(), source: row?.source ?? "MANUAL", requiresReview: row?.requiresReview ?? false, reason: row?.reason, hasRecord: Boolean(row) };
  });
  return { session: { id: String(session._id), state: session.state, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), scheduledStartsAt: session.scheduledStartsAt?.toISOString(), toleranceMinutes: session.toleranceMinutes ?? undefined }, items, summary: { total: items.length, present: items.filter((x) => x.status === "PRESENT").length, late: items.filter((x) => x.status === "LATE").length, absent: items.filter((x) => x.status === "ABSENT").length, justified: items.filter((x) => x.status === "JUSTIFIED").length, pending: items.filter((x) => x.status === "PENDING_REVIEW").length } };
}
export async function setManualAttendance(context: AuthContext, sessionId: string, input: { studentId: string; status: "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED"; reason?: string }) {
  const session = await ClassSession.findOne({ _id: objectId(sessionId), institutionId: tenantId(context) });
  if (!session) throw forbiddenEntity();
  assertGroupAccess(context, String(session.courseGroupId));
  const student = await Student.findOne({ _id: objectId(input.studentId), institutionId: tenantId(context), active: true, courseGroupId: session.courseGroupId });
  if (!student) throw forbiddenEntity();
  const prior = await Attendance.findOne({ institutionId: tenantId(context), classSessionId: session._id, studentId: student._id }).lean();
  if (session.state === "CLOSED" && !prior) throw new AppError(409, "SESSION_CLOSED", "No se pueden crear registros nuevos para una sesión cerrada.");
  if (prior && session.state === "CLOSED" && !input.reason?.trim()) throw new AppError(400, "CORRECTION_REASON_REQUIRED", "La clase ya está cerrada: escribe el motivo de la corrección.");
  const now = new Date();
  const update = { $set: { courseGroupId: session.courseGroupId, subjectId: session.subjectId, teacherUserId: session.teacherUserId, status: input.status, reason: input.reason, recordedAt: input.status === "ABSENT" || input.status === "JUSTIFIED" ? undefined : now, source: "MANUAL", requiresReview: false, updatedBy: actorId(context) }, $unset: { deviceScannedAt: 1, clientEventId: 1 } };
  const row = await Attendance.findOneAndUpdate({ institutionId: tenantId(context), classSessionId: session._id, studentId: student._id }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  await audit(context, prior ? "ATTENDANCE_CORRECTED" : "ATTENDANCE_MANUAL", "Attendance", row._id, prior ? { status: prior.status, reason: prior.reason } : undefined, { status: row.status, reason: row.reason, studentId: String(student._id) });
  return { id: String(row._id), studentId: String(student._id), status: row.status, label: statusLabel(row.status), recordedAt: row.recordedAt?.toISOString() };
}
export async function closeClassSession(context: AuthContext, sessionId: string) {
  const session = await ClassSession.findOne({ _id: objectId(sessionId), institutionId: tenantId(context) });
  if (!session) throw forbiddenEntity();
  assertGroupAccess(context, String(session.courseGroupId));
  session.state = "CLOSED"; session.closedAt = new Date(); await session.save();
  const roster = await Enrollment.find({ institutionId: tenantId(context), courseGroupId: session.courseGroupId, active: true }).select("studentId").lean();
  let absences = 0;
  for (const enrollment of roster) {
    const student = await Student.exists({ _id: enrollment.studentId, institutionId: tenantId(context), active: true });
    if (!student) continue;
    const result = await Attendance.updateOne({ institutionId: tenantId(context), classSessionId: session._id, studentId: enrollment.studentId }, { $setOnInsert: { courseGroupId: session.courseGroupId, subjectId: session.subjectId, teacherUserId: session.teacherUserId, status: "ABSENT", source: "SESSION_CLOSE", requiresReview: false, updatedBy: actorId(context) } }, { upsert: true });
    if (result.upsertedCount) absences += 1;
  }
  await audit(context, "CLASS_SESSION_CLOSED", "ClassSession", session._id, undefined, { absencesCreated: absences });
  return { id: String(session._id), state: session.state, absencesCreated: absences };
}
