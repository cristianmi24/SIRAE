import type { Types } from "mongoose";
import { z } from "zod";
import { CourseGroup, Institution, Membership } from "../models/index.js";
import { Schedule, Subject, TeachingLoad } from "../models/learning.js";
import type { AuthContext } from "./auth-context.js";
import { addCourseToTeacher } from "./account-limits.js";
import { actorId, audit, forbiddenEntity, objectId, tenantId } from "./learning-common.js";
import { AppError } from "../utils/errors.js";

// Intensidad horaria: el administrador define, por curso, qué docente dicta cada materia y cuántas
// horas semanales tiene. El horario reparte esas horas y no deja programar más.

const id = z.string().regex(/^[a-f\d]{24}$/i);
export const teachingLoadInput = z.object({
  courseGroupId: id,
  subjectId: id,
  teacherUserId: id,
  weeklyHours: z.number().min(0.5).max(40).refine((value) => Number.isInteger(value * 2), "Usa horas enteras o medias horas (por ejemplo 3 o 2,5)."),
}).strict();
export const classHourInput = z.object({ classHourMinutes: z.number().int().min(15).max(120) }).strict();

const toMinutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h! * 60 + m!; };
export const weeklyMinutes = (row: { weekdays: number[]; startTime: string; endTime: string }) => Math.max(0, toMinutes(row.endTime) - toMinutes(row.startTime)) * new Set(row.weekdays).size;
const hours = (minutes: number, classHour: number) => Math.round((minutes / classHour) * 100) / 100;
const fmt = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });

export async function classHourMinutes(context: AuthContext): Promise<number> {
  const institution = await Institution.findById(tenantId(context)).select("classHourMinutes").lean();
  return institution?.classHourMinutes ?? 60;
}

async function scheduledMinutes(institutionId: Types.ObjectId, courseGroupId: Types.ObjectId, subjectId: Types.ObjectId, excludeScheduleId?: Types.ObjectId) {
  const rows = await Schedule.find({ institutionId, courseGroupId, subjectId, active: true, ...(excludeScheduleId ? { _id: { $ne: excludeScheduleId } } : {}) }).select("weekdays startTime endTime").lean();
  return rows.reduce((sum, row) => sum + weeklyMinutes(row), 0);
}

export async function listTeachingLoads(context: AuthContext) {
  const institutionId = tenantId(context);
  const isAdmin = context.membership.role === "ADMIN";
  const scope = isAdmin ? {} : { teacherUserId: actorId(context) };
  const [loads, schedules, courses, subjects, memberships, classHour] = await Promise.all([
    TeachingLoad.find({ institutionId, active: true, ...scope }).lean(),
    Schedule.find({ institutionId, active: true }).select("courseGroupId subjectId weekdays startTime endTime").lean(),
    CourseGroup.find({ institutionId, active: true }).select("grade group").lean(),
    Subject.find({ institutionId, active: true }).select("name").lean(),
    Membership.find({ institutionId, active: true }).populate("userId", "displayName").lean(),
    classHourMinutes(context),
  ]);
  const minutesBy = new Map<string, number>();
  for (const row of schedules) { const key = `${row.courseGroupId}|${row.subjectId}`; minutesBy.set(key, (minutesBy.get(key) ?? 0) + weeklyMinutes(row)); }
  const courseLabel = new Map(courses.map((row) => [String(row._id), `${row.grade} ${row.group}`]));
  const subjectName = new Map(subjects.map((row) => [String(row._id), row.name]));
  const teachers = memberships.filter((row) => row.userId).map((row) => { const user = row.userId as unknown as { _id: Types.ObjectId; displayName?: string }; return { userId: String(user._id), name: user.displayName ?? "Docente", role: row.role, courseGroupIds: row.courseGroupIds.map(String) }; });
  const teacherName = new Map(teachers.map((row) => [row.userId, row.name]));
  return {
    classHourMinutes: classHour,
    teachers: isAdmin ? teachers : teachers.filter((row) => row.userId === context.user.id),
    items: loads.filter((row) => courseLabel.has(String(row.courseGroupId)) && subjectName.has(String(row.subjectId))).map((row) => ({
      id: String(row._id), courseGroupId: String(row.courseGroupId), courseLabel: courseLabel.get(String(row.courseGroupId))!, subjectId: String(row.subjectId), subjectName: subjectName.get(String(row.subjectId))!,
      teacherUserId: String(row.teacherUserId), teacherName: teacherName.get(String(row.teacherUserId)) ?? "Docente", weeklyHours: row.weeklyHours,
      scheduledHours: hours(minutesBy.get(`${row.courseGroupId}|${row.subjectId}`) ?? 0, classHour),
    })).sort((a, b) => a.courseLabel.localeCompare(b.courseLabel, "es", { numeric: true }) || a.subjectName.localeCompare(b.subjectName, "es")),
  };
}

export async function saveTeachingLoad(context: AuthContext, input: z.infer<typeof teachingLoadInput>) {
  const institutionId = tenantId(context);
  const courseGroupId = objectId(input.courseGroupId); const subjectId = objectId(input.subjectId); const teacherUserId = objectId(input.teacherUserId);
  const [course, subject, membership] = await Promise.all([
    CourseGroup.findOne({ _id: courseGroupId, institutionId, active: true }).select("grade group").lean(),
    Subject.findOne({ _id: subjectId, institutionId, active: true }),
    Membership.findOne({ userId: teacherUserId, institutionId, active: true }),
  ]);
  if (!course || !subject) throw forbiddenEntity();
  if (!membership) throw new AppError(400, "TEACHER_NOT_ASSIGNED", "El docente no pertenece a esta institución.");
  const classHour = await classHourMinutes(context);
  const scheduled = await scheduledMinutes(institutionId, courseGroupId, subjectId);
  if (scheduled > input.weeklyHours * classHour) throw new AppError(409, "LOAD_BELOW_SCHEDULE", `El horario ya tiene ${fmt(hours(scheduled, classHour))} h de ${subject.name} en ${course.grade} ${course.group}. Quita clases del horario antes de bajar la intensidad.`);
  const existing = await TeachingLoad.findOne({ institutionId, courseGroupId, subjectId });
  if (existing?.active && !existing.teacherUserId.equals(teacherUserId) && await Schedule.exists({ institutionId, courseGroupId, subjectId, active: true, teacherUserId: existing.teacherUserId })) {
    throw new AppError(409, "LOAD_TEACHER_HAS_SCHEDULE", "El docente anterior ya tiene clases de esta materia en el horario. Quítalas o reasígnalas antes de cambiar de docente.");
  }
  // El docente queda con el curso asignado (respetando su máximo de cursos) y la materia queda vinculada al curso.
  if (membership.role === "DOCENTE") await addCourseToTeacher(context, membership._id, courseGroupId);
  if (!subject.courseGroupIds.some((value) => value.equals(courseGroupId))) await Subject.updateOne({ _id: subjectId, institutionId }, { $addToSet: { courseGroupIds: courseGroupId } });
  const before = existing ? { teacherUserId: String(existing.teacherUserId), weeklyHours: existing.weeklyHours, active: existing.active } : undefined;
  const row = await TeachingLoad.findOneAndUpdate(
    { institutionId, courseGroupId, subjectId },
    { $set: { teacherUserId, weeklyHours: input.weeklyHours, active: true }, $setOnInsert: { institutionId, courseGroupId, subjectId, createdBy: actorId(context) } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );
  await audit(context, existing ? "TEACHING_LOAD_UPDATED" : "TEACHING_LOAD_CREATED", "TeachingLoad", row._id, before, { courseGroupId: input.courseGroupId, subjectId: input.subjectId, teacherUserId: input.teacherUserId, weeklyHours: input.weeklyHours });
  return { id: String(row._id), weeklyHours: row.weeklyHours, scheduledHours: hours(scheduled, classHour) };
}

export async function removeTeachingLoad(context: AuthContext, loadId: string) {
  const row = await TeachingLoad.findOne({ _id: objectId(loadId), institutionId: tenantId(context), active: true });
  if (!row) throw forbiddenEntity();
  row.active = false; await row.save();
  await audit(context, "TEACHING_LOAD_REMOVED", "TeachingLoad", row._id, { weeklyHours: row.weeklyHours, teacherUserId: String(row.teacherUserId) }, { active: false });
  return { id: String(row._id), active: false };
}

export async function setClassHourMinutes(context: AuthContext, minutes: number) {
  const before = await classHourMinutes(context);
  await Institution.updateOne({ _id: tenantId(context) }, { $set: { classHourMinutes: minutes } });
  await audit(context, "CLASS_HOUR_UPDATED", "Institution", tenantId(context), { classHourMinutes: before }, { classHourMinutes: minutes });
  return { classHourMinutes: minutes };
}

// Validación del horario frente a la asignación académica y a los cruces de horario.
// Devuelve el docente que debe quedar en la clase.
export async function checkScheduleRules(context: AuthContext, input: { courseGroupId: Types.ObjectId; subjectId: Types.ObjectId; teacherUserId?: Types.ObjectId; fallbackTeacherId?: Types.ObjectId; weekdays: number[]; startTime: string; endTime: string; excludeScheduleId?: Types.ObjectId }): Promise<Types.ObjectId> {
  const institutionId = tenantId(context);
  const load = await TeachingLoad.findOne({ institutionId, courseGroupId: input.courseGroupId, subjectId: input.subjectId, active: true }).populate("teacherUserId", "displayName").lean();
  const loadTeacher = load ? (load.teacherUserId as unknown as { _id: Types.ObjectId; displayName?: string }) : undefined;
  let teacherId = input.teacherUserId ?? loadTeacher?._id ?? input.fallbackTeacherId ?? actorId(context);
  if (load && loadTeacher) {
    if (input.teacherUserId && !input.teacherUserId.equals(loadTeacher._id)) {
      throw new AppError(409, "LOAD_TEACHER_MISMATCH", `Esta materia en este curso está asignada a ${loadTeacher.displayName ?? "otro docente"}. Cambia la asignación en Intensidad horaria si debe dictarla otra persona.`);
    }
    teacherId = loadTeacher._id;
    if (context.membership.role !== "ADMIN" && !teacherId.equals(actorId(context))) throw new AppError(403, "FORBIDDEN", "Esta materia en este curso está asignada a otro docente.");
    const classHour = await classHourMinutes(context);
    const others = await scheduledMinutes(institutionId, input.courseGroupId, input.subjectId, input.excludeScheduleId);
    const adding = weeklyMinutes(input);
    if (others + adding > load.weeklyHours * classHour) {
      const left = Math.max(0, load.weeklyHours * classHour - others);
      throw new AppError(409, "LOAD_HOURS_EXCEEDED", `Esta materia tiene ${fmt(load.weeklyHours)} h semanales en este curso. Ya hay ${fmt(hours(others, classHour))} h programadas y esta clase suma ${fmt(hours(adding, classHour))} h; ${left ? `quedan ${fmt(hours(left, classHour))} h por repartir.` : "ya no quedan horas por repartir."}`);
    }
  }
  // Cruces (solo instituciones, que arman el horario de varios docentes): ni el docente ni el curso
  // pueden tener dos clases a la misma hora. Las cuentas de docente conservan su comportamiento.
  if (context.institution.type !== "INSTITUTION") return teacherId;
  const start = input.startTime; const end = input.endTime;
  const overlapping = await Schedule.find({ institutionId, active: true, weekdays: { $in: input.weekdays }, startTime: { $lt: end }, endTime: { $gt: start }, $or: [{ teacherUserId: teacherId }, { courseGroupId: input.courseGroupId }], ...(input.excludeScheduleId ? { _id: { $ne: input.excludeScheduleId } } : {}) }).populate("subjectId", "name").populate("courseGroupId", "grade group").lean();
  const clash = overlapping[0];
  if (clash) {
    const subjectName = (clash.subjectId as unknown as { name?: string })?.name ?? "otra materia";
    const course = clash.courseGroupId as unknown as { grade?: string; group?: string };
    const sameCourse = String((clash.courseGroupId as unknown as { _id: Types.ObjectId })._id) === String(input.courseGroupId);
    throw new AppError(409, "SCHEDULE_OVERLAP", sameCourse ? `El curso ya tiene ${subjectName} de ${clash.startTime} a ${clash.endTime} esos días.` : `El docente ya tiene ${subjectName} en ${course?.grade ?? ""} ${course?.group ?? ""} de ${clash.startTime} a ${clash.endTime} esos días.`);
  }
  return teacherId;
}
