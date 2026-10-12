import type { Types } from "mongoose";
import { ACCOUNT_LIMITS, ADMIN_CONTACT_EMAIL, type AccountType } from "../../../shared/limits.js";
import { CourseGroup, Membership, MembershipInvitation } from "../models/index.js";
import type { AuthContext } from "./auth-context.js";
import { limitReached } from "../utils/errors.js";
import { tenantId } from "./learning-common.js";

export function accountType(context: AuthContext): AccountType {
  return context.institution.type === "INSTITUTION" ? "INSTITUTION" : "PERSONAL";
}

export function courseLimit(type: AccountType): number {
  return type === "INSTITUTION" ? ACCOUNT_LIMITS.INSTITUTION.courses : ACCOUNT_LIMITS.PERSONAL.courses;
}

function courseLimitMessage(type: AccountType): string {
  return type === "INSTITUTION"
    ? `La institución alcanzó el máximo de ${ACCOUNT_LIMITS.INSTITUTION.courses} cursos (${ACCOUNT_LIMITS.INSTITUTION.teachers} docentes × ${ACCOUNT_LIMITS.INSTITUTION.coursesPerTeacher} cursos).`
    : `Tu cuenta de docente permite un máximo de ${ACCOUNT_LIMITS.PERSONAL.courses} cursos.`;
}

export const countActiveCourses = (institutionId: Types.ObjectId) => CourseGroup.countDocuments({ institutionId, active: true });

// Antes de crear `adding` cursos nuevos. Los cursos existentes nunca se borran ni se modifican.
export async function assertCanCreateCourses(context: AuthContext, adding = 1, current?: number): Promise<void> {
  if (adding <= 0) return;
  const type = accountType(context);
  const existing = current ?? await countActiveCourses(tenantId(context));
  if (existing + adding > courseLimit(type)) {
    const detail = adding > 1 ? ` Ya tienes ${existing} y se crearían ${adding} nuevos.` : "";
    throw limitReached(`${courseLimitMessage(type)}${detail}`, ADMIN_CONTACT_EMAIL);
  }
}

// Verificación posterior a la creación: si dos solicitudes simultáneas superaron el límite,
// la que acaba de crear el curso lo deshace.
export async function rollbackCourseIfOverLimit(context: AuthContext, courseId: Types.ObjectId): Promise<void> {
  const type = accountType(context);
  if (await countActiveCourses(tenantId(context)) <= courseLimit(type)) return;
  await CourseGroup.deleteOne({ _id: courseId, institutionId: tenantId(context) });
  throw limitReached(courseLimitMessage(type), ADMIN_CONTACT_EMAIL);
}

// Docentes de una institución: membresías activas con rol docente + invitaciones de docente vigentes.
export async function countTeacherSlots(institutionId: Types.ObjectId, exclude: { membershipId?: Types.ObjectId } = {}): Promise<number> {
  const [members, invitations] = await Promise.all([
    Membership.countDocuments({ institutionId, role: "DOCENTE", active: true, ...(exclude.membershipId ? { _id: { $ne: exclude.membershipId } } : {}) }),
    MembershipInvitation.countDocuments({ institutionId, role: "DOCENTE", acceptedAt: { $exists: false }, expiresAt: { $gt: new Date() } }),
  ]);
  return members + invitations;
}

export function assertInstitutionAccount(context: AuthContext): void {
  if (accountType(context) !== "INSTITUTION") {
    throw limitReached("Las cuentas de docente son individuales y no pueden asociar otros docentes. Crea una cuenta de institución para gestionar varios docentes.", ADMIN_CONTACT_EMAIL);
  }
}

export function teacherLimitError() {
  return limitReached(`La institución alcanzó el máximo de ${ACCOUNT_LIMITS.INSTITUTION.teachers} docentes asociados (incluye invitaciones pendientes).`, ADMIN_CONTACT_EMAIL);
}

export async function assertCanAddTeacher(context: AuthContext, exclude: { membershipId?: Types.ObjectId } = {}): Promise<void> {
  assertInstitutionAccount(context);
  if (await countTeacherSlots(tenantId(context), exclude) >= ACCOUNT_LIMITS.INSTITUTION.teachers) throw teacherLimitError();
}

// Verificación posterior a la creación, por si dos solicitudes simultáneas superaron el límite.
export async function teacherSlotsWithinLimit(context: AuthContext): Promise<boolean> {
  return await countTeacherSlots(tenantId(context)) <= ACCOUNT_LIMITS.INSTITUTION.teachers;
}

export function teacherCourseLimitError() {
  return limitReached(`Cada docente puede tener como máximo ${ACCOUNT_LIMITS.INSTITUTION.coursesPerTeacher} cursos asignados.`, ADMIN_CONTACT_EMAIL);
}

export function assertTeacherCourseCount(context: AuthContext, courseCount: number): void {
  if (accountType(context) === "INSTITUTION" && courseCount > ACCOUNT_LIMITS.INSTITUTION.coursesPerTeacher) throw teacherCourseLimitError();
}

// Agrega un curso a un docente de forma atómica: solo si ya lo tiene o si aún no llega al límite.
export async function addCourseToTeacher(context: AuthContext, membershipId: Types.ObjectId, courseGroupId: Types.ObjectId): Promise<void> {
  const limited = accountType(context) === "INSTITUTION";
  const filter = limited
    ? { _id: membershipId, $or: [{ courseGroupIds: courseGroupId }, { [`courseGroupIds.${ACCOUNT_LIMITS.INSTITUTION.coursesPerTeacher - 1}`]: { $exists: false } }] }
    : { _id: membershipId };
  const result = await Membership.updateOne(filter, { $addToSet: { courseGroupIds: courseGroupId } });
  if (limited && result.matchedCount === 0) throw teacherCourseLimitError();
}

export async function accountUsage(context: AuthContext) {
  const type = accountType(context);
  const institutionId = tenantId(context);
  const courses = await countActiveCourses(institutionId);
  if (type === "PERSONAL") return { accountType: type, contactEmail: ADMIN_CONTACT_EMAIL, limits: { courses: ACCOUNT_LIMITS.PERSONAL.courses }, usage: { courses } };
  const teachers = await countTeacherSlots(institutionId);
  const own = context.membership.role === "DOCENTE" ? context.membership.courseGroupIds.length : undefined;
  return { accountType: type, contactEmail: ADMIN_CONTACT_EMAIL, limits: { courses: ACCOUNT_LIMITS.INSTITUTION.courses, teachers: ACCOUNT_LIMITS.INSTITUTION.teachers, coursesPerTeacher: ACCOUNT_LIMITS.INSTITUTION.coursesPerTeacher }, usage: { courses, teachers, ...(own !== undefined ? { ownCourses: own } : {}) } };
}
