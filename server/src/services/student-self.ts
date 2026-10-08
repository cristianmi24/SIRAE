import { createHash } from "node:crypto";
import type { Request } from "express";
import { CourseGroup, Institution, Student } from "../models/index.js";
import { Attendance, ClassSession, Subject } from "../models/learning.js";
import type { AuthContext } from "./auth-context.js";
import { gradeSummary } from "./grades.js";
import { AppError } from "../utils/errors.js";
import { normalizeStudentCode } from "../utils/student-code.js";

const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60_000;
// Intentos fallidos por dispositivo (sin IP). Se olvidan a los 15 minutos.
const failures = new Map<string, { count: number; until: number }>();
function deviceKey(request: Request) { const raw = request.cookies?.aulanexo_device; return typeof raw === "string" ? createHash("sha256").update(raw).digest("hex") : "sin-dispositivo"; }
function assertNotLocked(key: string) { const entry = failures.get(key); if (entry && entry.until > Date.now() && entry.count >= MAX_FAILURES) throw new AppError(429, "TOO_MANY_ATTEMPTS", "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo."); }
function registerFailure(key: string) { const entry = failures.get(key); const now = Date.now(); failures.set(key, entry && entry.until > now ? { count: entry.count + 1, until: entry.until } : { count: 1, until: now + WINDOW_MS }); }

const statusLabel: Record<string, string> = { PRESENT: "A tiempo", LATE: "Tarde", ABSENT: "No llegó", JUSTIFIED: "Justificada", PENDING_REVIEW: "Por revisar" };

// Consulta del propio estudiante con su código o su QR: historial de asistencia y notas, solo lectura.
export async function studentSelfReport(request: Request, input: { code?: string; tokenHash?: string }) {
  const key = deviceKey(request);
  assertNotLocked(key);
  const code = input.code ? normalizeStudentCode(input.code) : "";
  const tokenHash = input.tokenHash && /^[a-f0-9]{64}$/i.test(input.tokenHash) ? input.tokenHash.toLowerCase() : "";
  const matches = code.length >= 3 ? await Student.find({ documentNormalized: code, active: true }).limit(2) : tokenHash ? await Student.find({ qrTokenHash: tokenHash, active: true }).limit(2) : [];
  if (matches.length !== 1) {
    registerFailure(key);
    if (matches.length > 1) throw new AppError(409, "CODE_AMBIGUOUS", "Ese código está repetido en otra aula. Usa tu QR o pide a tu docente un código nuevo.");
    throw new AppError(404, "STUDENT_NOT_FOUND", "No encontramos un estudiante con ese código. Revísalo e inténtalo de nuevo.");
  }
  failures.delete(key);
  const student = matches[0]!;
  const [institution, group] = await Promise.all([
    Institution.findById(student.institutionId).select("name timezone").lean(),
    student.courseGroupId ? CourseGroup.findById(student.courseGroupId).select("grade group").lean() : null,
  ]);
  const timezone = institution?.timezone ?? "America/Bogota";
  // gradeSummary solo necesita la institución para filtrar; el estudiante no tiene sesión propia.
  const scope = { institution: { id: String(student.institutionId), name: institution?.name ?? "", timezone } } as unknown as AuthContext;
  const [grades, records, closedSessions] = await Promise.all([
    gradeSummary(scope, student._id),
    Attendance.find({ institutionId: student.institutionId, studentId: student._id }).sort({ createdAt: -1 }).limit(400).lean(),
    student.courseGroupId ? ClassSession.countDocuments({ institutionId: student.institutionId, courseGroupId: student.courseGroupId, state: "CLOSED" }) : 0,
  ]);
  const sessions = await ClassSession.find({ _id: { $in: records.map((r) => r.classSessionId) } }).select("startsAt dateKey subjectId").lean();
  const sessionById = new Map(sessions.map((s) => [String(s._id), s]));
  const subjects = await Subject.find({ _id: { $in: [...new Set(sessions.map((s) => String(s.subjectId)))] } }).select("name").lean();
  const subjectName = new Map(subjects.map((s) => [String(s._id), s.name]));
  const fmtDate = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtTime = (d?: Date | null) => d ? d.toLocaleTimeString("es-CO", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }) : undefined;
  const history = records.map((r) => { const s = sessionById.get(String(r.classSessionId)); return { date: s ? fmtDate(s.startsAt) : "", sortKey: s?.startsAt.toISOString() ?? "", subject: s ? subjectName.get(String(s.subjectId)) ?? "Clase" : "Clase", status: r.status, statusLabel: statusLabel[r.status] ?? r.status, time: fmtTime(r.recordedAt) }; }).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  const count = (status: string) => records.filter((r) => r.status === status).length;
  const present = count("PRESENT"); const late = count("LATE"); const justified = count("JUSTIFIED");
  return {
    student: { name: `${student.firstName} ${student.lastName}`, code: student.document, course: group ? `${group.grade} ${group.group}` : undefined },
    institution: institution?.name ?? "",
    generatedAt: new Date().toISOString(),
    attendance: { classes: Math.max(closedSessions, records.length), present, late, absent: count("ABSENT"), justified, percent: closedSessions ? Math.round((present + late + justified) * 1000 / closedSessions) / 10 : undefined },
    history: history.map(({ sortKey: _sortKey, ...row }) => row),
    grades: {
      average: grades.average, performance: grades.performance,
      periods: grades.periods.map((p) => ({ name: p.name, average: p.average, performance: p.performance })),
      assessments: grades.assessments.map((a) => ({ period: a.periodName, subject: a.subjectName, name: a.name, value: a.value, feedback: a.feedback })),
    },
  };
}
