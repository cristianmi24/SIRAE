import { CourseGroup, Student } from "../models/index.js";
import { AcademicPeriod, Assessment, Grade, GradeCategory, Subject } from "../models/learning.js";
import type { AuthContext } from "./auth-context.js";
import { actorId, assertGroupAccess, audit, forbiddenEntity, objectId, tenantId } from "./learning-common.js";
import type { Types } from "mongoose";
import { AppError } from "../utils/errors.js";

function iso(value: Date): string { return value.toISOString(); }
// En modo promedio todas las notas pesan lo mismo; en modo porcentajes cada nota usa su peso.
export function activityWeight(assessment: { weightPercent: number }, category?: { mode?: string | null }): number { return category?.mode === "AVERAGE" ? 1 : assessment.weightPercent; }
const DEFAULT_CATEGORY = "Notas del periodo";
export async function listSubjects(context: AuthContext) {
  const rows = await Subject.find({ institutionId: tenantId(context), active: true, ...(context.membership.role === "ADMIN" ? {} : { courseGroupIds: { $in: context.membership.courseGroupIds.map((value) => objectId(value)) } }) }).sort({ name: 1 }).lean();
  return rows.map((x) => ({ id: String(x._id), name: x.name, code: x.code, active: x.active, courseGroupIds: x.courseGroupIds.map(String) }));
}
export async function createSubject(context: AuthContext, input: { name: string; code?: string; courseGroupIds: string[] }) {
  for (const groupId of input.courseGroupIds) { assertGroupAccess(context, groupId); if (!await CourseGroup.exists({ _id: objectId(groupId), institutionId: tenantId(context), active: true })) throw forbiddenEntity(); }
  const row = await Subject.create({ institutionId: tenantId(context), name: input.name, code: input.code, courseGroupIds: input.courseGroupIds.map((x) => objectId(x)), createdBy: actorId(context) });
  await audit(context, "SUBJECT_CREATED", "Subject", row._id, undefined, { name: row.name });
  return { id: String(row._id), name: row.name, code: row.code, active: row.active, courseGroupIds: row.courseGroupIds.map(String) };
}
export async function listPeriods(context: AuthContext) {
  const rows = await AcademicPeriod.find({ institutionId: tenantId(context) }).sort({ startsOn: -1 }).lean();
  return rows.map((x) => ({ id: String(x._id), name: x.name, startsOn: iso(x.startsOn), endsOn: iso(x.endsOn), active: x.active, scale: x.scale }));
}
export async function createPeriod(context: AuthContext, input: { name: string; startsOn: string; endsOn: string; min: number; max: number; bands: { label: string; min: number; max: number }[] }) {
  const row = await AcademicPeriod.create({ institutionId: tenantId(context), name: input.name, startsOn: new Date(`${input.startsOn}T00:00:00.000Z`), endsOn: new Date(`${input.endsOn}T23:59:59.999Z`), active: true, scale: { min: input.min, max: input.max, bands: input.bands }, createdBy: actorId(context) });
  await audit(context, "ACADEMIC_PERIOD_CREATED", "AcademicPeriod", row._id, undefined, { name: row.name });
  return { id: String(row._id), name: row.name, startsOn: iso(row.startsOn), endsOn: iso(row.endsOn), active: row.active, scale: row.scale };
}
export async function listGradeSetup(context: AuthContext, periodId?: string, subjectId?: string) {
  const accessibleSubjects = context.membership.role === "ADMIN" ? undefined : (await Subject.find({ institutionId: tenantId(context), active: true, courseGroupIds: { $in: context.membership.courseGroupIds.map((value) => objectId(value)) } }).select("_id").lean()).map((x) => x._id);
  const filter: Record<string, unknown> = { institutionId: tenantId(context), ...(accessibleSubjects ? { subjectId: { $in: accessibleSubjects } } : {}) };
  if (periodId) filter.periodId = objectId(periodId);
  if (subjectId) filter.subjectId = objectId(subjectId);
  const [categories, assessments] = await Promise.all([GradeCategory.find(filter).sort({ name: 1 }).lean(), Assessment.find({ ...filter, active: true }).sort({ createdAt: 1 }).lean()]);
  return { categories: categories.map((x) => ({ id: String(x._id), periodId: String(x.periodId), subjectId: String(x.subjectId), name: x.name, weightPercent: x.weightPercent, mode: x.mode ?? "WEIGHTED" })), assessments: assessments.map((x) => ({ id: String(x._id), periodId: String(x.periodId), subjectId: String(x.subjectId), categoryId: String(x.categoryId), name: x.name, weightPercent: x.weightPercent, dueAt: x.dueAt?.toISOString() })) };
}
export async function createCategory(context: AuthContext, input: { periodId: string; subjectId: string; name: string; weightPercent: number }) {
  const period = await AcademicPeriod.findOne({ _id: objectId(input.periodId), institutionId: tenantId(context) });
  const subject = await Subject.findOne({ _id: objectId(input.subjectId), institutionId: tenantId(context), active: true });
  if (!period || !subject) throw forbiddenEntity();
  if (context.membership.role !== "ADMIN" && !subject.courseGroupIds.some((id) => context.membership.courseGroupIds.includes(String(id)))) throw forbiddenEntity();
  const existing = await GradeCategory.aggregate([{ $match: { institutionId: tenantId(context), periodId: period._id, subjectId: subject._id, active: true } }, { $group: { _id: null, sum: { $sum: "$weightPercent" } } }]);
  if ((existing[0]?.sum ?? 0) + input.weightPercent > 100.0001) throw new AppError(400, "WEIGHTS_EXCEEDED", "La suma del peso de las categorías no puede superar 100%.");
  const row = await GradeCategory.create({ institutionId: tenantId(context), periodId: period._id, subjectId: subject._id, name: input.name, weightPercent: input.weightPercent, createdBy: actorId(context) });
  await audit(context, "GRADE_CATEGORY_CREATED", "GradeCategory", row._id, undefined, { name: row.name, weightPercent: row.weightPercent });
  return { id: String(row._id), periodId: input.periodId, subjectId: input.subjectId, name: row.name, weightPercent: row.weightPercent };
}
async function planCategory(context: AuthContext, periodId: Types.ObjectId, subjectId: Types.ObjectId) {
  const [period, subject] = await Promise.all([AcademicPeriod.findOne({ _id: periodId, institutionId: tenantId(context) }), Subject.findOne({ _id: subjectId, institutionId: tenantId(context), active: true })]);
  if (!period || !subject) throw forbiddenEntity();
  if (context.membership.role !== "ADMIN" && !subject.courseGroupIds.some((id) => context.membership.courseGroupIds.includes(String(id)))) throw forbiddenEntity();
  const existing = await GradeCategory.findOne({ institutionId: tenantId(context), periodId, subjectId, active: true }).sort({ createdAt: 1 });
  if (existing) return existing;
  return GradeCategory.create({ institutionId: tenantId(context), periodId, subjectId, name: DEFAULT_CATEGORY, weightPercent: 100, mode: "WEIGHTED", createdBy: actorId(context) });
}
export async function setGradingMode(context: AuthContext, input: { periodId: string; subjectId: string; mode: "WEIGHTED" | "AVERAGE" }) {
  const category = await planCategory(context, objectId(input.periodId), objectId(input.subjectId));
  const before = category.mode ?? "WEIGHTED";
  await GradeCategory.updateMany({ institutionId: tenantId(context), periodId: category.periodId, subjectId: category.subjectId, active: true }, { $set: { mode: input.mode } });
  await audit(context, "GRADING_MODE_UPDATED", "GradeCategory", category._id, { mode: before }, { mode: input.mode });
  return { periodId: input.periodId, subjectId: input.subjectId, mode: input.mode };
}
async function assertWeightsFit(context: AuthContext, categoryId: Types.ObjectId, weight: number, excludeId?: Types.ObjectId) {
  const existing = await Assessment.aggregate([{ $match: { institutionId: tenantId(context), categoryId, active: true, ...(excludeId ? { _id: { $ne: excludeId } } : {}) } }, { $group: { _id: null, sum: { $sum: "$weightPercent" } } }]);
  const used = existing[0]?.sum ?? 0;
  if (used + weight > 100.0001) throw new AppError(400, "WEIGHTS_EXCEEDED", `Los porcentajes no pueden pasar de 100%. Ya tienes ${Math.round(used * 100) / 100}% asignado.`);
}
export async function createAssessment(context: AuthContext, input: { periodId: string; subjectId: string; categoryId?: string; name: string; weightPercent: number; dueAt?: string }) {
  const periodId = objectId(input.periodId); const subjectId = objectId(input.subjectId);
  const category = input.categoryId ? await GradeCategory.findOne({ _id: objectId(input.categoryId), institutionId: tenantId(context), periodId, subjectId, active: true }) : await planCategory(context, periodId, subjectId);
  if (!category) throw forbiddenEntity();
  const categoryId = category._id;
  const subject = await Subject.findOne({ _id: subjectId, institutionId: tenantId(context), active: true });
  if (!subject || (context.membership.role !== "ADMIN" && !subject.courseGroupIds.some((id) => context.membership.courseGroupIds.includes(String(id))))) throw forbiddenEntity();
  if (category.mode !== "AVERAGE") await assertWeightsFit(context, categoryId, input.weightPercent);
  const row = await Assessment.create({ institutionId: tenantId(context), periodId, subjectId, categoryId, name: input.name, weightPercent: input.weightPercent, dueAt: input.dueAt ? new Date(input.dueAt) : undefined, createdBy: actorId(context) });
  await audit(context, "ASSESSMENT_CREATED", "Assessment", row._id, undefined, { name: row.name, weightPercent: row.weightPercent });
  return { id: String(row._id), periodId: input.periodId, subjectId: input.subjectId, categoryId: String(categoryId), name: row.name, weightPercent: row.weightPercent, dueAt: row.dueAt?.toISOString() };
}
export async function updateAssessment(context: AuthContext, id: string, input: { name?: string; weightPercent?: number }) {
  const assessment = await Assessment.findOne({ _id: objectId(id), institutionId: tenantId(context), active: true });
  if (!assessment) throw forbiddenEntity();
  await assessmentScope(context, assessment._id);
  const category = await GradeCategory.findOne({ _id: assessment.categoryId, institutionId: tenantId(context) }).lean();
  if (input.weightPercent !== undefined && category?.mode !== "AVERAGE") await assertWeightsFit(context, assessment.categoryId, input.weightPercent, assessment._id);
  const before = { name: assessment.name, weightPercent: assessment.weightPercent };
  if (input.name !== undefined) assessment.name = input.name;
  if (input.weightPercent !== undefined) assessment.weightPercent = input.weightPercent;
  await assessment.save();
  await audit(context, "ASSESSMENT_UPDATED", "Assessment", assessment._id, before, { name: assessment.name, weightPercent: assessment.weightPercent });
  return { id: String(assessment._id), name: assessment.name, weightPercent: assessment.weightPercent };
}
export async function deleteAssessment(context: AuthContext, id: string) {
  const assessment = await Assessment.findOne({ _id: objectId(id), institutionId: tenantId(context), active: true });
  if (!assessment) throw forbiddenEntity();
  await assessmentScope(context, assessment._id);
  assessment.active = false;
  await assessment.save();
  await Grade.updateMany({ institutionId: tenantId(context), assessmentId: assessment._id }, { $set: { active: false } });
  await audit(context, "ASSESSMENT_DELETED", "Assessment", assessment._id, { active: true }, { active: false, name: assessment.name });
  return { id: String(assessment._id), active: false };
}
async function assessmentScope(context: AuthContext, assessmentId: Types.ObjectId) {
  const assessment = await Assessment.findOne({ _id: assessmentId, institutionId: tenantId(context), active: true }).lean();
  if (!assessment) throw forbiddenEntity();
  const subject = await Subject.findOne({ _id: assessment.subjectId, institutionId: tenantId(context) }).lean();
  if (context.membership.role !== "ADMIN" && subject?.courseGroupIds.length && !subject.courseGroupIds.some((groupId) => context.membership.courseGroupIds.includes(String(groupId)))) throw forbiddenEntity();
  return assessment;
}
export async function upsertGrade(context: AuthContext, input: { studentId: string; assessmentId: string; value: number; feedback?: string }) {
  const studentId = objectId(input.studentId); const assessmentId = objectId(input.assessmentId);
  const [student, assessment] = await Promise.all([Student.findOne({ _id: studentId, institutionId: tenantId(context), active: true }), assessmentScope(context, assessmentId)]);
  if (!student) throw forbiddenEntity();
  const subject = await Subject.findOne({ _id: assessment.subjectId, institutionId: tenantId(context), active: true });
  if (!subject) throw forbiddenEntity();
  if (subject.courseGroupIds.length && (!student.courseGroupId || !subject.courseGroupIds.some((groupId) => groupId.equals(student.courseGroupId!)))) throw forbiddenEntity();
  if (context.membership.role === "DOCENTE" && (!student.courseGroupId || !context.membership.courseGroupIds.includes(String(student.courseGroupId)))) throw forbiddenEntity();
  if (student.courseGroupId) assertGroupAccess(context, String(student.courseGroupId));
  if (input.value < -1e-9) throw new AppError(400, "GRADE_OUT_OF_RANGE", "La nota está fuera de la escala del periodo.");
  const period = await AcademicPeriod.findOne({ _id: assessment.periodId, institutionId: tenantId(context) });
  if (!period || input.value < period.scale.min || input.value > period.scale.max) throw new AppError(400, "GRADE_OUT_OF_RANGE", `La nota debe estar entre ${period?.scale.min ?? 0} y ${period?.scale.max ?? 0}.`);
  const prior = await Grade.findOne({ institutionId: tenantId(context), studentId, assessmentId }).lean();
  const row = await Grade.findOneAndUpdate({ institutionId: tenantId(context), studentId, assessmentId }, { $set: { value: input.value, feedback: input.feedback, gradedBy: actorId(context), active: true } }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true });
  await audit(context, prior ? "GRADE_UPDATED" : "GRADE_CREATED", "Grade", row._id, prior ? { value: prior.value } : undefined, { value: row.value, studentId: String(studentId), assessmentId: String(assessmentId) });
  return { id: String(row._id), studentId: String(studentId), assessmentId: String(assessmentId), value: row.value, feedback: row.feedback };
}
export async function listGrades(context: AuthContext, filters: { periodId?: string; subjectId?: string; studentId?: string }) {
  const match: Record<string, unknown> = { institutionId: tenantId(context), active: true };
  if (filters.studentId) match.studentId = objectId(filters.studentId);
  if (filters.periodId || filters.subjectId) { const ids = await Assessment.find({ institutionId: tenantId(context), active: true, ...(filters.periodId ? { periodId: objectId(filters.periodId) } : {}), ...(filters.subjectId ? { subjectId: objectId(filters.subjectId) } : {}) }).select("_id").lean(); match.assessmentId = { $in: ids.map((x) => x._id) }; }
  if (context.membership.role === "DOCENTE") { const accessible = await Student.find({ institutionId: tenantId(context), active: true, courseGroupId: { $in: context.membership.courseGroupIds.map((value) => objectId(value)) } }).select("_id").lean(); match.studentId = { $in: accessible.map((x) => x._id) }; }
  const rows = await Grade.find(match).sort({ updatedAt: -1 }).limit(5000).populate("studentId", "firstName lastName document courseGroupId").populate({ path: "assessmentId", select: "name periodId subjectId categoryId weightPercent dueAt", match: { ...(filters.periodId ? { periodId: objectId(filters.periodId) } : {}), ...(filters.subjectId ? { subjectId: objectId(filters.subjectId) } : {}) } }).lean();
  const valid = rows.filter((x) => x.assessmentId);
  const periodIds = [...new Set(valid.map((x) => String((x.assessmentId as unknown as { periodId: Types.ObjectId }).periodId)))].map((id) => objectId(id));
  const periodRows = await AcademicPeriod.find({ _id: { $in: periodIds }, institutionId: tenantId(context) }).select("_id name").lean();
  const periodNames = new Map(periodRows.map((x) => [String(x._id), x.name]));
  return valid.map((x) => { const student = x.studentId as unknown as { _id: Types.ObjectId; firstName: string; lastName: string }; const assessment = x.assessmentId as unknown as { name: string; periodId: Types.ObjectId; subjectId: Types.ObjectId; categoryId: Types.ObjectId; weightPercent: number; dueAt?: Date }; return { id: String(x._id), studentId: String(student._id), studentName: `${student.firstName} ${student.lastName}`, assessment: { ...assessment, periodId: String(assessment.periodId), subjectId: String(assessment.subjectId), categoryId: String(assessment.categoryId), periodName: periodNames.get(String(assessment.periodId)) ?? "Periodo" }, value: x.value, feedback: x.feedback }; });
}
export async function gradeSummary(context: AuthContext, studentId: Types.ObjectId, periodId?: Types.ObjectId, subjectId?: Types.ObjectId) {
  const gradeRows = await Grade.find({ institutionId: tenantId(context), studentId, active: true }).lean();
  const assessmentIds = [...new Set(gradeRows.map((row) => String(row.assessmentId)))].map((id) => objectId(id));
  const assessments = assessmentIds.length ? await Assessment.find({ _id: { $in: assessmentIds }, institutionId: tenantId(context), active: true, ...(periodId ? { periodId } : {}), ...(subjectId ? { subjectId } : {}) }).lean() : [];
  const assessmentMap = new Map(assessments.map((row) => [String(row._id), row]));
  const categoryIds = [...new Set(assessments.map((row) => String(row.categoryId)))].map((id) => objectId(id));
  const categories = categoryIds.length ? await GradeCategory.find({ _id: { $in: categoryIds }, institutionId: tenantId(context), active: true }).lean() : [];
  const categoryMap = new Map(categories.map((row) => [String(row._id), row]));
  const periodIds = [...new Set(assessments.map((row) => String(row.periodId)))].map((id) => objectId(id));
  const periodRows = periodIds.length ? await AcademicPeriod.find({ _id: { $in: periodIds }, institutionId: tenantId(context) }).lean() : [];
  const periodMap = new Map(periodRows.map((row) => [String(row._id), row]));
  const subjectIds = [...new Set(assessments.map((row) => String(row.subjectId)))].map((id) => objectId(id));
  const subjectRows = subjectIds.length ? await Subject.find({ _id: { $in: subjectIds }, institutionId: tenantId(context) }).select("name").lean() : [];
  const subjectMap = new Map(subjectRows.map((row) => [String(row._id), row.name]));
  const buckets = new Map<string, { periodId: string; subjectId: string; categoryId: string; score: number; activityWeight: number; categoryWeight: number }>();
  for (const grade of gradeRows) {
    const assessment = assessmentMap.get(String(grade.assessmentId));
    const category = assessment && categoryMap.get(String(assessment.categoryId));
    if (!assessment || !category) continue;
    const periodKey = String(assessment.periodId);
    const subjectKey = String(assessment.subjectId);
    const categoryKey = String(category._id);
    const key = `${periodKey}|${subjectKey}|${categoryKey}`;
    const bucket = buckets.get(key) ?? { periodId: periodKey, subjectId: subjectKey, categoryId: categoryKey, score: 0, activityWeight: 0, categoryWeight: category.weightPercent };
    bucket.score += grade.value * activityWeight(assessment, category);
    bucket.activityWeight += activityWeight(assessment, category);
    buckets.set(key, bucket);
  }
  const categorySummaries = [...buckets.values()].map((row) => ({ periodId: row.periodId, periodName: periodMap.get(row.periodId)?.name ?? "Periodo", subjectId: row.subjectId, subjectName: subjectMap.get(row.subjectId) ?? "Materia", categoryId: row.categoryId, categoryName: categoryMap.get(row.categoryId)?.name ?? "Categoría", categoryAverage: row.activityWeight ? Math.round((row.score / row.activityWeight) * 100) / 100 : undefined, weightPercent: row.categoryWeight }));
  const subjectScores = new Map<string, { total: number; weight: number }>();
  for (const row of [...buckets.values()]) {
    if (!row.activityWeight || !row.categoryWeight) continue;
    const key = `${row.periodId}|${row.subjectId}`;
    const score = subjectScores.get(key) ?? { total: 0, weight: 0 };
    score.total += (row.score / row.activityWeight) * row.categoryWeight;
    score.weight += row.categoryWeight;
    subjectScores.set(key, score);
  }
  const subjectAverages = new Map<string, number[]>();
  for (const [key, value] of subjectScores) {
    if (!value.weight) continue;
    const [periodKey] = key.split("|");
    const values = subjectAverages.get(periodKey!) ?? [];
    values.push(value.total / value.weight);
    subjectAverages.set(periodKey!, values);
  }
  const periods = [...subjectAverages.entries()].map(([id, values]) => {
    const period = periodMap.get(id);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const performance = period?.scale.bands.find((band) => average >= band.min && average <= band.max)?.label;
    return { id, name: period?.name ?? "Periodo", startsOn: period?.startsOn.toISOString() ?? "", average: Math.round(average * 100) / 100, performance };
  }).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const latestPeriod = periods.at(-1);
  const gradeItems = gradeRows.flatMap((grade) => {
    const assessment = assessmentMap.get(String(grade.assessmentId));
    if (!assessment) return [];
    const category = categoryMap.get(String(assessment.categoryId));
    const period = periodMap.get(String(assessment.periodId));
    return [{ assessmentId: String(assessment._id), name: assessment.name, value: grade.value, feedback: grade.feedback, periodId: String(assessment.periodId), periodName: period?.name ?? "Periodo", subjectId: String(assessment.subjectId), subjectName: subjectMap.get(String(assessment.subjectId)) ?? "Materia", categoryId: String(assessment.categoryId), categoryName: category?.name ?? "Categoría" }];
  });
  return { average: latestPeriod?.average, performance: latestPeriod?.performance, periods, categories: categorySummaries, assessments: gradeItems };
}
