import { AcademicPeriod, Assessment, Attendance, ClassSession, Grade, GradeCategory, Observation, Subject } from "../models/learning.js";
import { Enrollment, Institution, Student } from "../models/index.js";
import { activityWeight } from "./grades.js";
import type { AuthContext } from "./auth-context.js";
import { assertGroupAccess, objectId, tenantId } from "./learning-common.js";
import { AppError } from "../utils/errors.js";

export interface AnalyticsFilters { from?: string; to?: string; courseGroupId?: string; subjectId?: string; periodId?: string; studentId?: string }
export interface AnalyticsThresholds { attendanceLowPercent: number; attendanceHighPercent: number; performanceLowPercent: number; performanceHighPercent: number; lateCount: number; consecutiveAbsences: number }
const defaults: AnalyticsThresholds = { attendanceLowPercent: 75, attendanceHighPercent: 90, performanceLowPercent: 40, performanceHighPercent: 80, lateCount: 5, consecutiveAbsences: 3 };

export async function analyticsThresholds(context: AuthContext): Promise<AnalyticsThresholds> {
  const institution = await Institution.findById(tenantId(context)).lean();
  return { ...defaults, ...institution?.analyticsThresholds };
}
export async function updateAnalyticsThresholds(context: AuthContext, input: AnalyticsThresholds): Promise<AnalyticsThresholds> {
  await Institution.updateOne({ _id: tenantId(context) }, { $set: { analyticsThresholds: input } });
  return input;
}

export async function getAnalytics(context: AuthContext, filters: AnalyticsFilters) {
  const allowedGroups = context.membership.role === "ADMIN" ? undefined : context.membership.courseGroupIds.map((id) => objectId(id));
  const requestedGroup = filters.courseGroupId ? objectId(filters.courseGroupId) : undefined;
  if (requestedGroup) assertGroupAccess(context, String(requestedGroup));
  const matchGroups = requestedGroup ? [requestedGroup] : allowedGroups;
  const thresholds = await analyticsThresholds(context);
  const selectedPeriod = filters.periodId ? await AcademicPeriod.findOne({ _id: objectId(filters.periodId), institutionId: tenantId(context) }).lean() : undefined;
  if (filters.periodId && !selectedPeriod) throw new AppError(404, "PERIOD_NOT_FOUND", "El periodo seleccionado no existe en esta institución.");
  if (filters.studentId) {
    const requestedStudent = await Student.findOne({ _id: objectId(filters.studentId), institutionId: tenantId(context) }).select("courseGroupId").lean();
    if (!requestedStudent || (context.membership.role === "DOCENTE" && (!requestedStudent.courseGroupId || !context.membership.courseGroupIds.includes(String(requestedStudent.courseGroupId))))) throw new AppError(404, "NOT_FOUND", "No se encontró el estudiante solicitado.");
  }
  if (filters.subjectId) {
    const subject = await Subject.findOne({ _id: objectId(filters.subjectId), institutionId: tenantId(context), active: true }).lean();
    if (!subject || (context.membership.role === "DOCENTE" && !subject.courseGroupIds.some((id) => context.membership.courseGroupIds.includes(String(id))))) throw new AppError(404, "SUBJECT_NOT_FOUND", "La materia no está disponible para esta cuenta.");
  }
  const periodFrom = selectedPeriod?.startsOn.toISOString().slice(0, 10);
  const periodTo = selectedPeriod?.endsOn.toISOString().slice(0, 10);
  const from = periodFrom && filters.from ? (filters.from > periodFrom ? filters.from : periodFrom) : filters.from ?? periodFrom;
  const to = periodTo && filters.to ? (filters.to < periodTo ? filters.to : periodTo) : filters.to ?? periodTo;
  if (from && to && from > to) return { filters, thresholds, totals: { students: 0, sessions: 0, present: 0, late: 0, absent: 0, justified: 0, attendancePercent: 0, punctualityPercent: 0 }, students: [], alerts: [], trend: [], interpretation: "No hay datos en el rango seleccionado. Una relación estadística no demuestra causalidad." };

  const sessionQuery: Record<string, unknown> = { institutionId: tenantId(context) };
  if (matchGroups) sessionQuery.courseGroupId = { $in: matchGroups };
  if (filters.subjectId) sessionQuery.subjectId = objectId(filters.subjectId);
  if (from || to) sessionQuery.dateKey = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const sessions = (await ClassSession.find(sessionQuery).sort({ dateKey: -1, startsAt: -1 }).limit(2000).lean()).reverse();
  const closedSessions = sessions.filter((session) => session.state === "CLOSED");
  const closedSessionIds = closedSessions.map((session) => session._id);
  const sessionsPerGroup = new Map<string, number>();
  for (const session of closedSessions) {
    const groupId = String(session.courseGroupId);
    sessionsPerGroup.set(groupId, (sessionsPerGroup.get(groupId) ?? 0) + 1);
  }

  const enrollmentQuery: Record<string, unknown> = { institutionId: tenantId(context), active: true };
  if (matchGroups) enrollmentQuery.courseGroupId = { $in: matchGroups };
  const enrollments = await Enrollment.find(enrollmentQuery)
    .populate({ path: "studentId", match: { institutionId: tenantId(context), active: true }, select: "firstName lastName document courseGroupId" })
    .lean();
  let enrolled = enrollments.filter((row) => row.studentId).map((row) => row.studentId as unknown as { _id: { toString(): string }; firstName: string; lastName: string; document: string; courseGroupId: { toString(): string } });
  if (filters.studentId) enrolled = enrolled.filter((student) => student._id.toString() === filters.studentId);
  const students = enrolled;
  const studentIds = students.map((student) => objectId(student._id.toString()));
  const attendanceQuery: Record<string, unknown> = { institutionId: tenantId(context), classSessionId: { $in: closedSessionIds }, studentId: { $in: studentIds } };
  if (filters.studentId) attendanceQuery.studentId = objectId(filters.studentId);
  const attendance = closedSessionIds.length ? await Attendance.find(attendanceQuery).lean() : [];
  const counts = new Map<string, { present: number; late: number; absent: number; justified: number; pending: number }>();
  const statusByStudentSession = new Map<string, string>();
  for (const row of attendance) {
    const studentId = String(row.studentId);
    const counter = counts.get(studentId) ?? { present: 0, late: 0, absent: 0, justified: 0, pending: 0 };
    if (row.status === "PRESENT") counter.present++;
    else if (row.status === "LATE") counter.late++;
    else if (row.status === "ABSENT") counter.absent++;
    else if (row.status === "JUSTIFIED") counter.justified++;
    else counter.pending++;
    counts.set(studentId, counter);
    statusByStudentSession.set(`${studentId}|${String(row.classSessionId)}`, row.status);
  }

  const periodQuery: Record<string, unknown> = { institutionId: tenantId(context), ...(selectedPeriod ? { _id: selectedPeriod._id } : {}) };
  if (!selectedPeriod && (from || to)) periodQuery.$and = [
    ...(from ? [{ endsOn: { $gte: new Date(`${from}T00:00:00.000Z`) } }] : []),
    ...(to ? [{ startsOn: { $lte: new Date(`${to}T23:59:59.999Z`) } }] : []),
  ];
  const periods = await AcademicPeriod.find(periodQuery).sort({ startsOn: 1 }).lean();
  const periodById = new Map(periods.map((period) => [String(period._id), period]));
  const assessments = periods.length ? await Assessment.find({ institutionId: tenantId(context), active: true, periodId: { $in: periods.map((period) => period._id) }, ...(filters.subjectId ? { subjectId: objectId(filters.subjectId) } : {}) }).lean() : [];
  const assessmentById = new Map(assessments.map((assessment) => [String(assessment._id), assessment]));
  const categoryIds = [...new Set(assessments.map((assessment) => String(assessment.categoryId)))].map((id) => objectId(id));
  const categories = categoryIds.length ? await GradeCategory.find({ _id: { $in: categoryIds }, institutionId: tenantId(context), active: true }).lean() : [];
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));
  const grades = assessments.length && studentIds.length ? await Grade.find({ institutionId: tenantId(context), active: true, studentId: { $in: studentIds }, assessmentId: { $in: assessments.map((assessment) => assessment._id) } }).lean() : [];
  const gradeBuckets = new Map<string, Map<string, { score: number; activityWeight: number; categoryWeight: number }>>();
  for (const grade of grades) {
    const assessment = assessmentById.get(String(grade.assessmentId));
    const category = assessment && categoryById.get(String(assessment.categoryId));
    if (!assessment || !category) continue;
    const studentId = String(grade.studentId);
    const buckets = gradeBuckets.get(studentId) ?? new Map<string, { score: number; activityWeight: number; categoryWeight: number }>();
    const key = `${String(assessment.periodId)}|${String(assessment.subjectId)}|${String(category._id)}`;
    const item = buckets.get(key) ?? { score: 0, activityWeight: 0, categoryWeight: category.weightPercent };
    item.score += grade.value * activityWeight(assessment, category);
    item.activityWeight += activityWeight(assessment, category);
    buckets.set(key, item);
    gradeBuckets.set(studentId, buckets);
  }

  const summaries = students.map((student) => {
    const studentId = student._id.toString();
    const counter = counts.get(studentId) ?? { present: 0, late: 0, absent: 0, justified: 0, pending: 0 };
    const groupId = student.courseGroupId.toString();
    const totalSessions = sessionsPerGroup.get(groupId) ?? 0;
    const absent = Math.min(totalSessions, Math.max(counter.absent, totalSessions - counter.present - counter.late - counter.justified - counter.pending));
    const attendanceDenominator = Math.max(0, totalSessions - counter.pending);
    const attendancePercent = attendanceDenominator ? Math.round((counter.present + counter.late + counter.justified) * 10000 / attendanceDenominator) / 100 : undefined;
    const punctualityPercent = counter.present + counter.late ? Math.round(counter.present * 10000 / (counter.present + counter.late)) / 100 : undefined;
    const byPeriodSubject = new Map<string, { total: number; weight: number }>();
    for (const [categoryKey, item] of gradeBuckets.get(studentId) ?? []) {
      if (!item.activityWeight) continue;
      const [periodId, subjectId] = categoryKey.split("|");
      const key = `${periodId}|${subjectId}`;
      const subject = byPeriodSubject.get(key) ?? { total: 0, weight: 0 };
      subject.total += (item.score / item.activityWeight) * item.categoryWeight;
      subject.weight += item.categoryWeight;
      byPeriodSubject.set(key, subject);
    }
    const periodSubjectScores = new Map<string, number[]>();
    for (const [key, score] of byPeriodSubject) {
      if (!score.weight) continue;
      const [periodId] = key.split("|");
      const scores = periodSubjectScores.get(periodId!) ?? [];
      scores.push(score.total / score.weight);
      periodSubjectScores.set(periodId!, scores);
    }
    const periodTrend = [...periodSubjectScores.entries()].map(([periodId, scores]) => {
      const period = periodById.get(periodId);
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const performancePercent = period && period.scale.max > period.scale.min ? Math.round((average - period.scale.min) * 10000 / (period.scale.max - period.scale.min)) / 100 : undefined;
      const performance = period?.scale.bands.find((band) => average >= band.min && average <= band.max)?.label;
      return { periodId, periodName: period?.name ?? "Periodo", average: Math.round(average * 100) / 100, performancePercent, performance, startsOn: period?.startsOn.toISOString() ?? "" };
    }).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    const latest = periodTrend.at(-1);
    const pattern = attendancePercent !== undefined && latest?.performancePercent !== undefined
      ? attendancePercent < thresholds.attendanceLowPercent && latest.performancePercent <= thresholds.performanceLowPercent ? "LOW_ATTENDANCE_LOW_PERFORMANCE"
        : attendancePercent >= thresholds.attendanceHighPercent && latest.performancePercent >= thresholds.performanceHighPercent ? "HIGH_ATTENDANCE_HIGH_PERFORMANCE" : undefined
      : undefined;
    return { id: studentId, name: `${student.firstName} ${student.lastName}`, document: student.document, courseGroupId: groupId, totalSessions, present: counter.present, late: counter.late, absent, justified: counter.justified, pendingReview: counter.pending, attendancePercent, punctualityPercent, average: latest?.average, performance: latest?.performance, performancePercent: latest?.performancePercent, periodTrend, pattern };
  });

  const studentIdObjects = summaries.map((summary) => objectId(summary.id));
  const observationMatch: Record<string, unknown> = { institutionId: tenantId(context), studentId: { $in: studentIdObjects }, status: { $in: ["OPEN", "IN_PROGRESS"] } };
  if (from || to) observationMatch.observedAt = { ...(from ? { $gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { $lte: new Date(`${to}T23:59:59.999Z`) } : {}) };
  const pendingObservations = studentIdObjects.length
    ? await Observation.aggregate([
        { $match: observationMatch },
        { $group: { _id: "$studentId", count: { $sum: 1 }, high: { $sum: { $cond: [{ $eq: ["$priority", "HIGH"] }, 1, 0] } } } },
      ])
    : [];
  const openByStudent = new Map(pendingObservations.map((row: { _id: { toString(): string }; count: number; high: number }) => [row._id.toString(), row]));
  const alerts = summaries.flatMap((summary) => {
    const result: { type: string; studentId: string; studentName: string; message: string }[] = [];
    if (summary.totalSessions && summary.attendancePercent !== undefined && summary.attendancePercent < thresholds.attendanceLowPercent) result.push({ type: "LOW_ATTENDANCE", studentId: summary.id, studentName: summary.name, message: `Asistencia baja: ${summary.attendancePercent}% de sesiones cerradas.` });
    if (summary.late >= thresholds.lateCount) result.push({ type: "FREQUENT_LATE", studentId: summary.id, studentName: summary.name, message: `${summary.late} tardanzas en el periodo seleccionado.` });
    if (summary.totalSessions > 0 && summary.attendancePercent === 100) result.push({ type: "PERFECT_ATTENDANCE", studentId: summary.id, studentName: summary.name, message: "Asistencia completa en las sesiones cerradas." });
    if (summary.pattern === "LOW_ATTENDANCE_LOW_PERFORMANCE") result.push({ type: summary.pattern, studentId: summary.id, studentName: summary.name, message: "Posible relación entre menor asistencia y un desempeño bajo normalizado; requiere interpretación docente, no implica causalidad." });
    if (summary.pattern === "HIGH_ATTENDANCE_HIGH_PERFORMANCE") result.push({ type: summary.pattern, studentId: summary.id, studentName: summary.name, message: "Posible relación entre asistencia alta y desempeño alto normalizado; es un patrón descriptivo, no causal." });
    const open = openByStudent.get(summary.id);
    if (open) result.push({ type: "FOLLOW_UP_REQUIRED", studentId: summary.id, studentName: summary.name, message: `${open.count} seguimiento(s) abierto(s)${open.high ? `, ${open.high} de prioridad alta` : ""}.` });
    const history = closedSessions.filter((session) => String(session.courseGroupId) === summary.courseGroupId).map((session) => {
      const status = statusByStudentSession.get(`${summary.id}|${String(session._id)}`);
      return status === "ABSENT" || !status ? 0 : status === "PENDING_REVIEW" ? -1 : 1;
    });
    let consecutive = 0;
    for (let index = history.length - 1; index >= 0 && history[index] === 0; index--) consecutive++;
    if (consecutive >= thresholds.consecutiveAbsences) result.push({ type: "CONSECUTIVE_ABSENCE", studentId: summary.id, studentName: summary.name, message: `${consecutive} ausencias consecutivas en sesiones cerradas.` });
    const recent = summary.periodTrend.slice(-3);
    if (recent.length === 3 && recent.every((period) => period.performancePercent !== undefined) && recent[0]!.performancePercent! > recent[1]!.performancePercent! && recent[1]!.performancePercent! > recent[2]!.performancePercent! && recent[0]!.performancePercent! - recent[2]!.performancePercent! >= 10) result.push({ type: "DECLINING_PERFORMANCE", studentId: summary.id, studentName: summary.name, message: "Se observa descenso progresivo en el porcentaje normalizado de la escala en los tres periodos más recientes." });
    return result;
  });

  const trendByDate = new Map<string, { present: number; late: number; absent: number; justified: number; pendingReview: number }>();
  const sessionDate = new Map(closedSessions.map((session) => [String(session._id), session.dateKey]));
  for (const session of closedSessions) if (!trendByDate.has(session.dateKey)) trendByDate.set(session.dateKey, { present: 0, late: 0, absent: 0, justified: 0, pendingReview: 0 });
  for (const row of attendance) {
    const bucket = trendByDate.get(sessionDate.get(String(row.classSessionId)) ?? "");
    if (!bucket) continue;
    if (row.status === "PRESENT") bucket.present++;
    else if (row.status === "LATE") bucket.late++;
    else if (row.status === "ABSENT") bucket.absent++;
    else if (row.status === "JUSTIFIED") bucket.justified++;
    else bucket.pendingReview++;
  }
  const totals = summaries.reduce((result, student) => ({ present: result.present + student.present, late: result.late + student.late, absent: result.absent + student.absent, justified: result.justified + student.justified, pending: result.pending + student.pendingReview, sessions: result.sessions + student.totalSessions }), { present: 0, late: 0, absent: 0, justified: 0, pending: 0, sessions: 0 });
  const attended = totals.present + totals.late + totals.justified;
  const rateDenominator = Math.max(0, totals.sessions - totals.pending);
  return {
    filters,
    thresholds,
    totals: { students: summaries.length, sessions: closedSessions.length, present: totals.present, late: totals.late, absent: totals.absent, justified: totals.justified, attendancePercent: rateDenominator ? Math.round(attended * 10000 / rateDenominator) / 100 : 0, punctualityPercent: totals.present + totals.late ? Math.round(totals.present * 10000 / (totals.present + totals.late)) / 100 : 0 },
    students: summaries,
    alerts,
    trend: [...trendByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value })),
    interpretation: "La comparación normaliza cada nota al rango de su propio periodo. Se muestran posibles relaciones y tendencias descriptivas; no se infiere que asistencia, puntualidad o rendimiento causen los demás resultados.",
  };
}
