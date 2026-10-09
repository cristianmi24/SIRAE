import { AcademicPeriod, Attendance, ClassSession, Observation, Subject } from "../models/learning.js";
import { CourseGroup, Student } from "../models/index.js";
import type { AuthContext } from "./auth-context.js";
import { assertGroupAccess, audit, forbiddenEntity, objectId, tenantId } from "./learning-common.js";
import { gradeSummary } from "./grades.js";
import { AppError } from "../utils/errors.js";
import { localDateTime } from "../utils/school-time.js";
import { renderStudentPdf } from "../utils/student-report-pdf.js";

export interface ReportFilter { periodId?: string; subjectId?: string; from?: string; to?: string }
function nextDateKey(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}
function maxDateKey(left: string, right: string): string { return left > right ? left : right; }
function minDateKey(left: string, right: string): string { return left < right ? left : right; }
async function buildStudentReport(context: AuthContext, studentId: string, filters: ReportFilter) {
  const student = await Student.findOne({ _id: objectId(studentId), institutionId: tenantId(context) });
  if (!student) throw forbiddenEntity();
  if (context.membership.role === "DOCENTE" && (!student.courseGroupId || !context.membership.courseGroupIds.includes(String(student.courseGroupId)))) throw forbiddenEntity();
  if (student.courseGroupId) assertGroupAccess(context, String(student.courseGroupId));
  const group = student.courseGroupId ? await CourseGroup.findOne({ _id: student.courseGroupId, institutionId: tenantId(context) }).lean() : undefined;
  const subject = filters.subjectId ? await Subject.findOne({ _id: objectId(filters.subjectId), institutionId: tenantId(context), active: true }).lean() : undefined;
  if (filters.subjectId && (!subject || (student.courseGroupId && subject.courseGroupIds.length && !subject.courseGroupIds.some((groupId) => groupId.equals(student.courseGroupId!))))) throw forbiddenEntity();
  const period = filters.periodId ? await AcademicPeriod.findOne({ _id: objectId(filters.periodId), institutionId: tenantId(context) }).lean() : undefined;
  if (filters.periodId && !period) throw forbiddenEntity();
  const periodFrom = period?.startsOn.toISOString().slice(0, 10);
  const periodTo = period?.endsOn.toISOString().slice(0, 10);
  const fromKey = periodFrom ? (filters.from ? maxDateKey(periodFrom, filters.from) : periodFrom) : filters.from;
  const toKey = periodTo ? (filters.to ? minDateKey(periodTo, filters.to) : periodTo) : filters.to;
  if (fromKey && toKey && fromKey > toKey) throw new AppError(400, "REPORT_RANGE_EMPTY", "El rango de fechas no se cruza con el periodo seleccionado.");
  const start = fromKey ? localDateTime(fromKey, "00:00", context.institution.timezone) : undefined;
  const endExclusive = toKey ? localDateTime(nextDateKey(toKey), "00:00", context.institution.timezone) : undefined;
  const sessionQuery: Record<string, unknown> = { institutionId: tenantId(context), state: "CLOSED" };
  if (student.courseGroupId) sessionQuery.courseGroupId = student.courseGroupId;
  if (filters.subjectId) sessionQuery.subjectId = objectId(filters.subjectId);
  if (start || endExclusive) sessionQuery.startsAt = { ...(start ? { $gte: start } : {}), ...(endExclusive ? { $lt: endExclusive } : {}) };
  const sessions = await ClassSession.find(sessionQuery).sort({ startsAt: 1 }).limit(1001).lean();
  if (sessions.length > 1000) throw new AppError(413, "REPORT_SESSION_LIMIT", "El informe contiene más de 1.000 sesiones; reduce el periodo o el rango de fechas para evitar un PDF parcial.");
  const records = sessions.length ? await Attendance.find({ institutionId: tenantId(context), studentId: student._id, classSessionId: { $in: sessions.map((x) => x._id) } }).lean() : [];
  const attendanceCounts = {
    present: records.filter((x) => x.status === "PRESENT").length,
    late: records.filter((x) => x.status === "LATE").length,
    absent: records.filter((x) => x.status === "ABSENT").length,
    justified: records.filter((x) => x.status === "JUSTIFIED").length,
    pendingReview: records.filter((x) => x.requiresReview || x.status === "PENDING_REVIEW").length,
  };
  const attended = attendanceCounts.present + attendanceCounts.late + attendanceCounts.justified;
  const attendancePct = sessions.length ? Math.round(attended * 10000 / sessions.length) / 100 : undefined;
  const grades = await gradeSummary(context, student._id, filters.periodId ? objectId(filters.periodId) : undefined, filters.subjectId ? objectId(filters.subjectId) : undefined);
  const observationRange = start || endExclusive ? { observedAt: { ...(start ? { $gte: start } : {}), ...(endExclusive ? { $lt: endExclusive } : {}) } } : {};
  const observations = await Observation.find({ institutionId: tenantId(context), studentId: student._id, ...observationRange }).sort({ observedAt: -1 }).limit(101).lean();
  if (observations.length > 100) throw new AppError(413, "REPORT_OBSERVATION_LIMIT", "El informe contiene más de 100 observaciones en el rango; reduce el periodo para obtener un reporte completo.");
  const data = {
    studentName: `${student.firstName} ${student.lastName}`,
    documentNumber: student.document,
    groupLabel: group ? `${group.grade} ${group.group}` : "Sin asignar",
    periodName: period?.name ?? "Todos los periodos",
    subjectName: subject?.name ?? "Todas",
    fromKey,
    toKey,
    timezone: context.institution.timezone,
    sessionCount: sessions.length,
    attendance: attendanceCounts,
    attendancePercent: attendancePct,
    grades: {
      periods: grades.periods.map((item) => ({ name: item.name, average: item.average, performance: item.performance })),
      average: grades.average,
      performance: grades.performance,
      assessments: grades.assessments.map((item) => ({ periodName: item.periodName, subjectName: item.subjectName, name: item.name, value: item.value, feedback: item.feedback })),
      categories: grades.categories.map((item) => ({ periodId: item.periodId, periodName: item.periodName, subjectId: item.subjectId, subjectName: item.subjectName, average: item.categoryAverage, weightPercent: item.weightPercent })),
    },
    observations: observations.map((item) => ({ observedAt: item.observedAt, type: item.type, priority: item.priority, status: item.status, description: item.description, followUp: item.followUp })),
  };
  return { data, studentObjectId: student._id, sessions: sessions.length };
}
export async function createStudentPdf(context: AuthContext, studentId: string, filters: ReportFilter): Promise<Buffer> {
  const report = await buildStudentReport(context, studentId, filters);
  const buffer = await renderStudentPdf({ ...report.data, institutionName: context.institution.name });
  await audit(context, "STUDENT_REPORT_GENERATED", "Student", report.studentObjectId, undefined, { periodId: filters.periodId, subjectId: filters.subjectId, from: filters.from, to: filters.to, sessions: report.sessions });
  return buffer;
}
// Datos del informe para la plantilla web imprimible.
export async function studentReportData(context: AuthContext, studentId: string, filters: ReportFilter) {
  const report = await buildStudentReport(context, studentId, filters);
  await audit(context, "STUDENT_REPORT_VIEWED", "Student", report.studentObjectId, undefined, { periodId: filters.periodId, subjectId: filters.subjectId, from: filters.from, to: filters.to, sessions: report.sessions });
  return { ...report.data, institutionName: context.institution.name, generatedAt: new Date().toISOString() };
}
// Planilla de definitivas por curso: una fila por estudiante y una columna por asignatura.
export async function courseGradesReport(context: AuthContext, courseGroupId: string, periodId?: string) {
  assertGroupAccess(context, courseGroupId);
  const group = await CourseGroup.findOne({ _id: objectId(courseGroupId), institutionId: tenantId(context), active: true }).lean();
  if (!group) throw forbiddenEntity();
  const period = periodId ? await AcademicPeriod.findOne({ _id: objectId(periodId), institutionId: tenantId(context) }).lean() : undefined;
  if (periodId && !period) throw forbiddenEntity();
  const [subjects, students] = await Promise.all([
    Subject.find({ institutionId: tenantId(context), active: true, courseGroupIds: group._id }).sort({ name: 1 }).lean(),
    Student.find({ institutionId: tenantId(context), active: true, courseGroupId: group._id }).sort({ lastName: 1, firstName: 1 }).lean(),
  ]);
  const rows = [];
  for (const student of students) {
    const summary = await gradeSummary(context, student._id, period?._id);
    const bySubject = new Map<string, { total: number; weight: number }>();
    for (const category of summary.categories) {
      if (category.categoryAverage === undefined || !category.weightPercent) continue;
      const item = bySubject.get(category.subjectId) ?? { total: 0, weight: 0 };
      item.total += category.categoryAverage * category.weightPercent; item.weight += category.weightPercent;
      bySubject.set(category.subjectId, item);
    }
    const grades: Record<string, number> = {};
    for (const [subjectId, item] of bySubject) if (item.weight) grades[subjectId] = Math.round((item.total / item.weight) * 100) / 100;
    const values = Object.values(grades);
    rows.push({ id: String(student._id), name: `${student.lastName} ${student.firstName}`, document: student.document, grades, average: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : undefined });
  }
  await audit(context, "COURSE_GRADES_REPORT_VIEWED", "CourseGroup", group._id, undefined, { periodId, students: rows.length });
  return {
    institutionName: context.institution.name, generatedAt: new Date().toISOString(),
    course: { id: String(group._id), label: `${group.grade} ${group.group}`, academicYear: group.academicYear },
    period: period ? { id: String(period._id), name: period.name, scale: period.scale } : undefined,
    subjects: subjects.map((subject) => ({ id: String(subject._id), name: subject.name })),
    students: rows,
  };
}
