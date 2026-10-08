import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { CourseGroup, Institution, Student } from "../models/index.js";
import { Attendance, AttendanceLinkEvent, ClassSession, Schedule, Subject } from "../models/learning.js";
import type { AuthContext } from "./auth-context.js";
import { closeClassSession } from "./attendance.js";
import { assertGroupAccess, audit, forbiddenEntity, objectId, tenantId } from "./learning-common.js";
import { AppError } from "../utils/errors.js";
import { classifyPunctuality } from "../utils/school-time.js";
import { normalizeStudentCode } from "../utils/student-code.js";
import { applicationCookieOptions } from "./local-auth.js";

const DEVICE_COOKIE = "aulanexo_device";
const MAX_FAILED_ATTEMPTS = 5;
// Los controles de dispositivo se borran solos unas horas después de cerrar el registro.
const PURGE_AFTER_MS = 6 * 60 * 60_000;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

type LinkSession = { _id: unknown; state: string; linkToken?: string | null; linkOpensAt?: Date | null; linkExpiresAt?: Date | null; linkAutoClose?: boolean | null; linkClosedAt?: Date | null };
function linkState(session: LinkSession, now = new Date()) {
  if (!session.linkToken || !session.linkOpensAt || !session.linkExpiresAt) return "OFF" as const;
  if (session.state !== "OPEN" || now >= session.linkExpiresAt) return "EXPIRED" as const;
  return "ACTIVE" as const;
}

// Cierre automático de la jornada: al vencer el tiempo se cierra la clase si el docente lo pidió.
async function settleExpiredLink(context: AuthContext, sessionId: string) {
  const session = await ClassSession.findOne({ _id: objectId(sessionId), institutionId: tenantId(context) });
  if (!session || linkState(session) !== "EXPIRED" || session.linkClosedAt) return;
  session.linkClosedAt = new Date();
  await session.save();
  const registered = await AttendanceLinkEvent.countDocuments({ institutionId: tenantId(context), classSessionId: session._id, kind: "REGISTERED" });
  await audit(context, "ATTENDANCE_LINK_EXPIRED", "ClassSession", session._id, undefined, { registered, autoClose: Boolean(session.linkAutoClose) });
  if (session.linkAutoClose && session.state === "OPEN") await closeClassSession(context, sessionId);
}

export async function getAttendanceLink(context: AuthContext, sessionId: string) {
  const found = await ClassSession.findOne({ _id: objectId(sessionId), institutionId: tenantId(context) });
  if (!found) throw forbiddenEntity();
  assertGroupAccess(context, String(found.courseGroupId));
  await settleExpiredLink(context, sessionId);
  const session = (await ClassSession.findById(found._id).lean())!;
  const events = session.linkToken ? await AttendanceLinkEvent.find({ institutionId: tenantId(context), classSessionId: session._id }).sort({ at: -1 }).limit(200).populate("studentId", "firstName lastName").lean() : [];
  const studentName = (value: unknown) => { const s = value as { firstName?: string; lastName?: string } | undefined; return s?.firstName ? `${s.firstName} ${s.lastName ?? ""}`.trim() : undefined; };
  return {
    state: linkState(session),
    token: session.linkToken ?? undefined,
    opensAt: session.linkOpensAt?.toISOString(),
    expiresAt: session.linkExpiresAt?.toISOString(),
    autoClose: Boolean(session.linkAutoClose),
    sessionState: session.state,
    registered: events.filter((e) => e.kind === "REGISTERED").length,
    alerts: events.filter((e) => e.kind !== "REGISTERED").slice(0, 30).map((e) => ({ id: String(e._id), kind: e.kind, at: e.at.toISOString(), studentName: studentName(e.studentId), detail: e.detail })),
  };
}

export async function openAttendanceLink(context: AuthContext, sessionId: string, input: { minutes: number; autoClose: boolean }) {
  const session = await ClassSession.findOne({ _id: objectId(sessionId), institutionId: tenantId(context) });
  if (!session) throw forbiddenEntity();
  assertGroupAccess(context, String(session.courseGroupId));
  if (session.state !== "OPEN") throw new AppError(409, "SESSION_CLOSED", "La clase ya está cerrada.");
  const now = new Date();
  // Cada jornada nueva tiene su propio enlace; el anterior deja de funcionar.
  if (linkState(session, now) !== "ACTIVE") { session.linkToken = randomBytes(18).toString("base64url"); session.linkOpensAt = now; session.linkClosedAt = undefined; }
  session.linkExpiresAt = new Date(now.getTime() + input.minutes * 60_000);
  session.linkAutoClose = input.autoClose;
  await session.save();
  await audit(context, "ATTENDANCE_LINK_OPENED", "ClassSession", session._id, undefined, { minutes: input.minutes, autoClose: input.autoClose });
  return getAttendanceLink(context, sessionId);
}

export async function closeAttendanceLink(context: AuthContext, sessionId: string) {
  const session = await ClassSession.findOne({ _id: objectId(sessionId), institutionId: tenantId(context) });
  if (!session) throw forbiddenEntity();
  assertGroupAccess(context, String(session.courseGroupId));
  if (linkState(session) === "ACTIVE") { session.linkExpiresAt = new Date(); await session.save(); }
  return getAttendanceLink(context, sessionId);
}

/* ───────── Página pública del estudiante (sin sesión iniciada) ───────── */

// Identificador del navegador generado por el sistema. No se usan IP ni datos personales.
const validDevice = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(value);
export function ensureDeviceId(request: Request, response: Response): string {
  const current = request.cookies?.[DEVICE_COOKIE];
  if (validDevice(current)) return current;
  const value = randomBytes(18).toString("base64url");
  response.cookie(DEVICE_COOKIE, value, { ...applicationCookieOptions(request), maxAge: 24 * 60 * 60_000 });
  return value;
}

async function sessionForToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return ClassSession.findOne({ linkToken: token });
}

export async function publicLinkInfo(request: Request, response: Response, token: string) {
  const device = sha(ensureDeviceId(request, response));
  const session = await sessionForToken(token);
  if (!session) throw new AppError(404, "LINK_NOT_FOUND", "Este enlace de asistencia no existe.");
  const state = linkState(session);
  // Pantalla bloqueada solo mientras esta jornada siga abierta; al cerrarse se libera sola
  // y la siguiente clase usa otro enlace, así que el bloqueo no se arrastra.
  const own = state === "ACTIVE" ? await AttendanceLinkEvent.findOne({ classSessionId: session._id, deviceHash: device, kind: "REGISTERED" }).populate("studentId", "firstName lastName").lean() : null;
  const ownStudent = own?.studentId as unknown as { _id: unknown; firstName: string; lastName: string } | undefined;
  const ownAttendance = ownStudent ? await Attendance.findOne({ classSessionId: session._id, studentId: ownStudent._id }).select("status recordedAt").lean() : null;
  const [group, subject, institution] = await Promise.all([
    CourseGroup.findById(session.courseGroupId).select("grade group").lean(),
    Subject.findById(session.subjectId).select("name").lean(),
    Institution.findById(session.institutionId).select("name").lean(),
  ]);
  const timezone = (await Institution.findById(session.institutionId).select("timezone").lean())?.timezone ?? "America/Bogota";
  const registered = ownStudent && ownAttendance ? { studentName: `${ownStudent.firstName} ${ownStudent.lastName}`, status: ownAttendance.status, statusLabel: ownAttendance.status === "LATE" ? "Tarde" : ownAttendance.status === "PRESENT" ? "A tiempo" : "Registrada", time: ownAttendance.recordedAt?.toLocaleTimeString("es-CO", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }) } : undefined;
  return { state, registered, course: group ? `${group.grade} ${group.group}` : "", subject: subject?.name ?? "", institution: institution?.name ?? "", expiresAt: session.linkExpiresAt?.toISOString(), serverTime: new Date().toISOString() };
}

export async function publicRegister(request: Request, response: Response, token: string, rawCode: string) {
  const rawDevice = request.cookies?.[DEVICE_COOKIE];
  if (!validDevice(rawDevice)) { ensureDeviceId(request, response); throw new AppError(400, "DEVICE_REQUIRED", "Vuelve a abrir el enlace desde tu navegador e intenta de nuevo (debe permitir cookies)."); }
  const device = sha(rawDevice);
  const session = await sessionForToken(token);
  if (!session) throw new AppError(404, "LINK_NOT_FOUND", "Este enlace de asistencia no existe.");
  const now = new Date();
  if (linkState(session, now) !== "ACTIVE") throw new AppError(410, "LINK_EXPIRED", "El registro de asistencia ya cerró. Habla con tu docente.");
  const base = { institutionId: session.institutionId, classSessionId: session._id, deviceHash: device, at: now, purgeAt: new Date(session.linkExpiresAt!.getTime() + PURGE_AFTER_MS) };

  // Control del dispositivo: un dispositivo registra una sola credencial por jornada.
  const usedByDevice = await AttendanceLinkEvent.findOne({ classSessionId: session._id, deviceHash: device, kind: "REGISTERED" }).lean();
  if (usedByDevice) {
    await AttendanceLinkEvent.create({ ...base, kind: "DEVICE_BLOCKED", detail: "Intentó registrar otro código desde un dispositivo que ya registró asistencia." });
    throw new AppError(409, "DEVICE_ALREADY_USED", "Este dispositivo ya registró una asistencia en esta clase. Cada estudiante debe usar su propio dispositivo.");
  }
  const failures = await AttendanceLinkEvent.countDocuments({ classSessionId: session._id, deviceHash: device, kind: "CODE_INVALID" });
  if (failures >= MAX_FAILED_ATTEMPTS) throw new AppError(429, "TOO_MANY_ATTEMPTS", "Demasiados códigos incorrectos desde este dispositivo. Pide ayuda a tu docente.");

  const code = normalizeStudentCode(rawCode);
  const student = code.length >= 3 ? await Student.findOne({ institutionId: session.institutionId, documentNormalized: code, active: true, courseGroupId: session.courseGroupId }) : null;
  if (!student) {
    await AttendanceLinkEvent.create({ ...base, kind: "CODE_INVALID", detail: `Código incorrecto (${code.slice(0, 2)}…)` });
    throw new AppError(404, "CODE_INVALID", `El código no corresponde a ningún estudiante de esta clase. Te quedan ${Math.max(0, MAX_FAILED_ATTEMPTS - failures - 1)} intentos.`);
  }
  // Disponible → Registrada → Bloqueada: cada credencial marca una sola vez por jornada.
  if (await Attendance.exists({ classSessionId: session._id, studentId: student._id })) {
    await AttendanceLinkEvent.create({ ...base, kind: "ALREADY_REGISTERED", studentId: student._id, detail: "Intentó usar un código que ya registró asistencia." });
    throw new AppError(409, "CODE_ALREADY_USED", "Este código ya registró asistencia en esta clase y quedó bloqueado.");
  }
  const schedule = await Schedule.findById(session.scheduleId).select("toleranceMinutes").lean();
  const status = now < session.startsAt ? "PRESENT" : classifyPunctuality(now, session.startsAt, session.toleranceMinutes ?? schedule?.toleranceMinutes ?? 0);
  try {
    await Attendance.create({ institutionId: session.institutionId, classSessionId: session._id, studentId: student._id, courseGroupId: session.courseGroupId, subjectId: session.subjectId, teacherUserId: session.teacherUserId, status, recordedAt: now, source: "LINK", requiresReview: false, updatedBy: session.teacherUserId });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new AppError(409, "CODE_ALREADY_USED", "Este código ya registró asistencia en esta clase y quedó bloqueado.");
    throw error;
  }
  await AttendanceLinkEvent.create({ ...base, kind: "REGISTERED", studentId: student._id });
  const institution = await Institution.findById(session.institutionId).select("timezone").lean();
  return { studentName: student.firstName, status, statusLabel: status === "PRESENT" ? "A tiempo" : "Tarde", time: now.toLocaleTimeString("es-CO", { timeZone: institution?.timezone ?? "America/Bogota", hour: "2-digit", minute: "2-digit" }) };
}

