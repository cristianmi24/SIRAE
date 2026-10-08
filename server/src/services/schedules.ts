import { CourseGroup, Enrollment, Membership } from "../models/index.js";
import { ClassSession, Schedule, ScheduleBreak, Subject } from "../models/learning.js";
import type { AuthContext } from "./auth-context.js";
import { actorId, assertGroupAccess, audit, forbiddenEntity, objectId, tenantId } from "./learning-common.js";
import { isoWeekday, localDateTime } from "../utils/school-time.js";
import { AppError } from "../utils/errors.js";

export async function listSchedules(context: AuthContext) {
  const groupScope = context.membership.role === "ADMIN" ? {} : { courseGroupId: { $in: context.membership.courseGroupIds.map((id) => objectId(id)) } };
  const rows = await Schedule.find({ institutionId: tenantId(context), active: true, ...groupScope }).sort({ startTime: 1 }).lean();
  return rows.map((x) => ({ id: String(x._id), courseGroupId: String(x.courseGroupId), subjectId: String(x.subjectId), teacherUserId: String(x.teacherUserId), weekdays: x.weekdays, startTime: x.startTime, endTime: x.endTime, toleranceMinutes: x.toleranceMinutes, timezone: x.timezone, active: x.active }));
}
export async function createSchedule(context: AuthContext, input: { courseGroupId: string; subjectId: string; teacherUserId?: string; weekdays: number[]; startTime: string; endTime: string; toleranceMinutes: number }) {
  assertGroupAccess(context, input.courseGroupId);
  const groupId = objectId(input.courseGroupId); const subjectId = objectId(input.subjectId);
  const [group, subject] = await Promise.all([CourseGroup.findOne({ _id: groupId, institutionId: tenantId(context), active: true }), Subject.findOne({ _id: subjectId, institutionId: tenantId(context), active: true })]);
  if (!group || !subject) throw forbiddenEntity();
  if (!subject.courseGroupIds.some((id) => id.equals(groupId))) throw new AppError(400, "SUBJECT_GROUP_MISMATCH", "La materia no está vinculada a este curso/grupo.");
  const teacherId = input.teacherUserId ? objectId(input.teacherUserId) : actorId(context);
  const teacherMembership = await Membership.findOne({ userId: teacherId, institutionId: tenantId(context), active: true });
  if (!teacherMembership) throw new AppError(400, "TEACHER_NOT_ASSIGNED", "El docente no pertenece a esta institución.");
  if (context.membership.role !== "ADMIN" && !teacherId.equals(actorId(context))) throw new AppError(403, "FORBIDDEN", "Solo un administrador puede asignar otro docente.");
  if (teacherMembership.role === "DOCENTE") await Membership.updateOne({ _id: teacherMembership._id }, { $addToSet: { courseGroupIds: groupId } });
  const row = await Schedule.create({ institutionId: tenantId(context), courseGroupId: groupId, subjectId, teacherUserId: teacherId, weekdays: [...new Set(input.weekdays)].sort(), startTime: input.startTime, endTime: input.endTime, toleranceMinutes: input.toleranceMinutes, timezone: context.institution.timezone, createdBy: actorId(context) });
  await audit(context, "SCHEDULE_CREATED", "Schedule", row._id, undefined, { courseGroupId: String(groupId), subjectId: String(subjectId), toleranceMinutes: row.toleranceMinutes });
  return { id: String(row._id), courseGroupId: String(groupId), subjectId: String(subjectId), teacherUserId: String(teacherId), weekdays: row.weekdays, startTime: row.startTime, endTime: row.endTime, toleranceMinutes: row.toleranceMinutes, timezone: row.timezone, active: row.active };
}

export async function updateSchedule(context: AuthContext, id: string, input: { courseGroupId?: string; subjectId?: string; teacherUserId?: string; weekdays?: number[]; startTime?: string; endTime?: string; toleranceMinutes?: number }) {
  const row = await Schedule.findOne({ _id: objectId(id), institutionId: tenantId(context), active: true });
  if (!row) throw forbiddenEntity();
  if (context.membership.role !== "ADMIN" && String(row.teacherUserId) !== actorId(context).toString()) throw forbiddenEntity();
  const groupId = objectId(input.courseGroupId ?? String(row.courseGroupId));
  assertGroupAccess(context, String(groupId));
  const subjectId = objectId(input.subjectId ?? String(row.subjectId));
  const [group, subject] = await Promise.all([CourseGroup.findOne({ _id: groupId, institutionId: tenantId(context), active: true }), Subject.findOne({ _id: subjectId, institutionId: tenantId(context), active: true })]);
  if (!group || !subject || !subject.courseGroupIds.some((value) => value.equals(groupId))) throw new AppError(400, "SUBJECT_GROUP_MISMATCH", "La materia no está vinculada a este curso/grupo activo.");
  const teacherId = input.teacherUserId ? objectId(input.teacherUserId) : row.teacherUserId;
  const teacherMembership = await Membership.findOne({ userId: teacherId, institutionId: tenantId(context), active: true });
  if (!teacherMembership) throw new AppError(400, "TEACHER_NOT_ASSIGNED", "El docente no pertenece a esta institución.");
  if (context.membership.role !== "ADMIN" && !teacherId.equals(actorId(context))) throw new AppError(403, "FORBIDDEN", "Solo un administrador puede asignar otro docente.");
  const startTime = input.startTime ?? row.startTime;
  const endTime = input.endTime ?? row.endTime;
  if (endTime <= startTime) throw new AppError(400, "SCHEDULE_INVALID", "La hora final debe ser posterior a la inicial.");
  const before = { courseGroupId: String(row.courseGroupId), subjectId: String(row.subjectId), teacherUserId: String(row.teacherUserId), weekdays: row.weekdays, startTime: row.startTime, endTime: row.endTime, toleranceMinutes: row.toleranceMinutes, timezone: row.timezone };
  row.courseGroupId = groupId;
  row.subjectId = subjectId;
  row.teacherUserId = teacherId;
  if (input.weekdays) row.weekdays = [...new Set(input.weekdays)].sort((left, right) => left - right);
  row.startTime = startTime;
  row.endTime = endTime;
  if (input.toleranceMinutes !== undefined) row.toleranceMinutes = input.toleranceMinutes;
  row.timezone = context.institution.timezone;
  if (teacherMembership.role === "DOCENTE") await Membership.updateOne({ _id: teacherMembership._id }, { $addToSet: { courseGroupIds: groupId } });
  await row.save();
  await audit(context, "SCHEDULE_UPDATED", "Schedule", row._id, before, { courseGroupId: String(groupId), subjectId: String(subjectId), teacherUserId: String(teacherId), weekdays: row.weekdays, startTime, endTime, toleranceMinutes: row.toleranceMinutes, timezone: row.timezone });
  return { id: String(row._id), courseGroupId: String(groupId), subjectId: String(subjectId), teacherUserId: String(teacherId), weekdays: row.weekdays, startTime, endTime, toleranceMinutes: row.toleranceMinutes, timezone: row.timezone, active: row.active };
}

export async function deactivateSchedule(context: AuthContext, id: string) {
  const row = await Schedule.findOne({ _id: objectId(id), institutionId: tenantId(context), active: true });
  if (!row) throw forbiddenEntity();
  if (context.membership.role !== "ADMIN" && String(row.teacherUserId) !== actorId(context).toString()) throw forbiddenEntity();
  assertGroupAccess(context, String(row.courseGroupId));
  row.active = false;
  await row.save();
  await audit(context, "SCHEDULE_DEACTIVATED", "Schedule", row._id, { active: true }, { active: false, courseGroupId: String(row.courseGroupId), subjectId: String(row.subjectId) });
  return { id: String(row._id), active: false };
}
type SessionRow = { _id: unknown; scheduleId: unknown; courseGroupId: unknown; subjectId: unknown; dateKey: string; startsAt: Date; endsAt: Date; timezone: string; state: "OPEN" | "CLOSED"; scheduledStartsAt?: Date | null; toleranceMinutes?: number | null; adjustedAt?: Date | null };
function sessionDto(x: SessionRow) { return { id: String(x._id), scheduleId: String(x.scheduleId), courseGroupId: String(x.courseGroupId), subjectId: String(x.subjectId), dateKey: x.dateKey, startsAt: x.startsAt.toISOString(), endsAt: x.endsAt.toISOString(), timezone: x.timezone, state: x.state, scheduledStartsAt: x.scheduledStartsAt?.toISOString(), toleranceMinutes: x.toleranceMinutes ?? undefined, adjustedAt: x.adjustedAt?.toISOString() }; }
export async function listSessions(context: AuthContext, dateKey?: string) {
  const groupScope = context.membership.role === "ADMIN" ? {} : { courseGroupId: { $in: context.membership.courseGroupIds.map((id) => objectId(id)) } };
  const parts = dateKey?.split("-").map(Number);
  const nextDateKey = parts?.length === 3 ? new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]! + 1)).toISOString().slice(0, 10) : undefined;
  const range = dateKey && nextDateKey ? { startsAt: { $gte: localDateTime(dateKey, "00:00", context.institution.timezone), $lt: localDateTime(nextDateKey, "00:00", context.institution.timezone) } } : {};
  const rows = await ClassSession.find({ institutionId: tenantId(context), ...groupScope, ...range }).sort({ startsAt: -1 }).limit(100).lean();
  return rows.map(sessionDto);
}
export async function ensureClassSession(context: AuthContext, input: { scheduleId: string; dateKey: string }) {
  const scheduleId = objectId(input.scheduleId); const schedule = await Schedule.findOne({ _id: scheduleId, institutionId: tenantId(context), active: true });
  if (!schedule) throw forbiddenEntity();
  assertGroupAccess(context, String(schedule.courseGroupId));
  if (!schedule.weekdays.includes(isoWeekday(input.dateKey, schedule.timezone))) throw new AppError(400, "SCHEDULE_NOT_FOUND", "No hay clase programada para ese día.");
  const startsAt = localDateTime(input.dateKey, schedule.startTime, schedule.timezone);
  const endsAt = localDateTime(input.dateKey, schedule.endTime, schedule.timezone);
  if (endsAt <= startsAt) throw new AppError(400, "SCHEDULE_INVALID", "La hora final debe ser posterior a la inicial.");
  const row = await ClassSession.findOneAndUpdate({ institutionId: tenantId(context), scheduleId, dateKey: input.dateKey }, { $setOnInsert: { scheduleId, courseGroupId: schedule.courseGroupId, subjectId: schedule.subjectId, teacherUserId: schedule.teacherUserId, dateKey: input.dateKey, startsAt, endsAt, timezone: schedule.timezone, state: "OPEN", createdBy: actorId(context) } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return sessionDto(row);
}
// Ajuste solo para esta fecha: la clase empieza cuando el docente abre el lector.
// El horario semanal no cambia; la sesión guarda la hora programada original.
export async function adjustClassSession(context: AuthContext, sessionId: string, input: { startNow?: boolean; toleranceMinutes: number }) {
  const row = await ClassSession.findOne({ _id: objectId(sessionId), institutionId: tenantId(context) });
  if (!row) throw forbiddenEntity();
  assertGroupAccess(context, String(row.courseGroupId));
  if (row.state !== "OPEN") throw new AppError(409, "SESSION_CLOSED", "La sesión ya está cerrada.");
  const before = { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), toleranceMinutes: row.toleranceMinutes };
  if (input.startNow) {
    const now = new Date();
    if (!row.scheduledStartsAt) { row.scheduledStartsAt = row.startsAt; row.scheduledEndsAt = row.endsAt; }
    const duration = (row.scheduledEndsAt ?? row.endsAt).getTime() - (row.scheduledStartsAt ?? row.startsAt).getTime();
    row.startsAt = now;
    // Si la clase ya debía haber terminado, se conserva su duración desde ahora.
    if (row.endsAt.getTime() <= now.getTime() + 10 * 60_000) row.endsAt = new Date(now.getTime() + Math.max(duration, 30 * 60_000));
  }
  row.toleranceMinutes = input.toleranceMinutes;
  row.adjustedAt = new Date(); row.adjustedBy = actorId(context);
  await row.save();
  await audit(context, "SESSION_START_ADJUSTED", "ClassSession", row._id, before, { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), toleranceMinutes: row.toleranceMinutes });
  return sessionDto(row);
}
export async function getSessionContext(context: AuthContext) {
  const [groups, subjects, schedules] = await Promise.all([
    CourseGroup.find({ institutionId: tenantId(context), active: true, ...(context.membership.role === "ADMIN" ? {} : { _id: { $in: context.membership.courseGroupIds.map((id) => objectId(id)) } }) }).sort({ grade: 1, group: 1 }).lean(),
    Subject.find({ institutionId: tenantId(context), active: true, ...(context.membership.role === "ADMIN" ? {} : { courseGroupIds: { $in: context.membership.courseGroupIds.map((id) => objectId(id)) } }) }).sort({ name: 1 }).lean(),
    listSchedules(context),
  ]);
  return { timezone: context.institution.timezone, queueScope: `${context.institution.id}:${context.user.id}`, groups: groups.map((x) => ({ id: String(x._id), label: `${x.grade} ${x.group}`, academicYear: x.academicYear })), subjects: subjects.map((x) => ({ id: String(x._id), name: x.name, courseGroupIds: x.courseGroupIds.map(String) })), schedules };
}

function breakDto(row: { _id: unknown; courseGroupId?: unknown; label: string; weekdays: number[]; startTime: string; endTime: string }) { return { id: String(row._id), courseGroupId: row.courseGroupId ? String(row.courseGroupId) : undefined, label: row.label, weekdays: row.weekdays, startTime: row.startTime, endTime: row.endTime }; }
export async function listScheduleBreaks(context: AuthContext) {
  const groupScope = context.membership.role === "ADMIN" ? {} : { $or: [{ courseGroupId: { $exists: false } }, { courseGroupId: null }, { courseGroupId: { $in: context.membership.courseGroupIds.map((id) => objectId(id)) } }] };
  const rows = await ScheduleBreak.find({ institutionId: tenantId(context), active: true, ...groupScope }).sort({ startTime: 1 }).lean();
  return rows.map(breakDto);
}
export async function createScheduleBreak(context: AuthContext, input: { courseGroupId?: string; label: string; weekdays: number[]; startTime: string; endTime: string }) {
  if (!input.courseGroupId && context.membership.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Solo un administrador puede crear descansos para todos los cursos.");
  if (input.courseGroupId) {
    assertGroupAccess(context, input.courseGroupId);
    if (!await CourseGroup.exists({ _id: objectId(input.courseGroupId), institutionId: tenantId(context), active: true })) throw forbiddenEntity();
  }
  const row = await ScheduleBreak.create({ institutionId: tenantId(context), courseGroupId: input.courseGroupId ? objectId(input.courseGroupId) : undefined, label: input.label, weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b), startTime: input.startTime, endTime: input.endTime, createdBy: actorId(context) });
  await audit(context, "SCHEDULE_BREAK_CREATED", "ScheduleBreak", row._id, undefined, { label: row.label, startTime: row.startTime, endTime: row.endTime });
  return breakDto(row);
}
export async function deleteScheduleBreak(context: AuthContext, id: string) {
  const row = await ScheduleBreak.findOne({ _id: objectId(id), institutionId: tenantId(context), active: true });
  if (!row) throw forbiddenEntity();
  if (row.courseGroupId) assertGroupAccess(context, String(row.courseGroupId));
  else if (context.membership.role !== "ADMIN") throw forbiddenEntity();
  row.active = false;
  await row.save();
  await audit(context, "SCHEDULE_BREAK_DELETED", "ScheduleBreak", row._id, { active: true }, { active: false });
  return { id: String(row._id), active: false };
}
