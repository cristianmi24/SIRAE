import { z } from "zod";

const id = z.string().regex(/^[a-f\d]{24}$/i, "El identificador no es válido.");
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa una fecha válida.").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "La fecha no existe en el calendario.");
const name = z.string().trim().min(1).max(120);
const scheduleFields = z.object({
  courseGroupId: id,
  subjectId: id,
  teacherUserId: id.optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  toleranceMinutes: z.number().int().min(0).max(180),
});
export const subjectInput = z.object({ name: name.max(100), code: z.string().trim().max(32).optional(), courseGroupIds: z.array(id).min(1).max(100) });
export const periodInput = z.object({ name: z.string().trim().min(1).max(80), startsOn: dateKey, endsOn: dateKey, min: z.number().finite(), max: z.number().finite(), bands: z.array(z.object({ label: z.string().trim().min(1).max(40), min: z.number().finite(), max: z.number().finite() })).min(1).max(12) })
  .refine((value) => value.startsOn <= value.endsOn, { path: ["endsOn"], message: "La fecha final debe ser posterior a la inicial." })
  .refine((value) => value.min < value.max && value.bands.every((band) => band.min >= value.min && band.max <= value.max && band.min <= band.max), { path: ["bands"], message: "La escala o sus rangos no son válidos." })
  .refine((value) => [...value.bands].sort((left, right) => left.min - right.min).every((band, index, bands) => index === 0 || band.min > bands[index - 1]!.max), { path: ["bands"], message: "Los rangos de desempeño no pueden solaparse." });
export const categoryInput = z.object({ periodId: id, subjectId: id, name: name.max(80), weightPercent: z.number().min(0).max(100) });
export const assessmentInput = z.object({ periodId: id, subjectId: id, categoryId: id.optional(), name, weightPercent: z.number().min(0).max(100), dueAt: z.string().datetime().optional() });
export const gradeInput = z.object({ studentId: id, assessmentId: id, value: z.number().finite(), feedback: z.string().trim().max(2000).optional() });
export const scheduleInput = scheduleFields.refine((value) => value.endTime > value.startTime, { path: ["endTime"], message: "La hora final debe ser posterior a la inicial." });
export const scheduleUpdateInput = scheduleFields.partial()
  .refine((value) => Object.keys(value).length > 0, "Incluye al menos un campo para actualizar.")
  .refine((value) => !value.startTime || !value.endTime || value.endTime > value.startTime, { path: ["endTime"], message: "La hora final debe ser posterior a la inicial." });
export const createSessionInput = z.object({ scheduleId: id, dateKey });
export const scanInput = z.object({ classSessionId: id, tokenHash: z.string().regex(/^[a-f0-9]{64}$/i), clientEventId: z.string().uuid().optional(), deviceScannedAt: z.string().datetime().optional() });
export const manualAttendanceInput = z.object({ studentId: id, status: z.enum(["PRESENT", "LATE", "ABSENT", "JUSTIFIED"]), reason: z.string().trim().max(500).optional() }).refine((value) => value.status !== "JUSTIFIED" || Boolean(value.reason?.trim()), { path: ["reason"], message: "Indica el motivo de la ausencia justificada." });
export const observationInput = z.object({ studentId: id, type: name.max(64), description: z.string().trim().min(1).max(3000), priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"), followUp: z.string().trim().max(2000).optional(), status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]).default("OPEN"), observedAt: z.string().datetime().optional() });
export const idParam = z.object({ id });
export const reportFilterInput = z.object({ periodId: id.optional(), subjectId: id.optional(), from: dateKey.optional(), to: dateKey.optional() })
  .refine((value) => !value.from || !value.to || value.from <= value.to, { path: ["to"], message: "La fecha final debe ser igual o posterior a la fecha inicial." });
export const assessmentUpdateInput = z.object({ name: name.optional(), weightPercent: z.number().min(0).max(100).optional() });
export const gradingModeInput = z.object({ periodId: id, subjectId: id, mode: z.enum(["WEIGHTED", "AVERAGE"]) });
export const scheduleBreakInput = z.object({ courseGroupId: id.optional(), label: z.string().trim().min(1).max(60), weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).refine((value) => value.endTime > value.startTime, { path: ["endTime"], message: "La hora final debe ser posterior a la inicial." });
export const sessionAdjustInput = z.object({ startNow: z.boolean().optional(), toleranceMinutes: z.number().int().min(0).max(180) });
export const attendanceLinkInput = z.object({ minutes: z.number().int().min(1).max(240), autoClose: z.boolean().default(false) });
