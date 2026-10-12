import { CourseGroup } from "../models/index.js";
import { Subject } from "../models/learning.js";
import type { AuthContext } from "./auth-context.js";
import { conflict } from "../utils/errors.js";
import { normalizeForLookup } from "../utils/text.js";
import { z } from "zod";
import { GRADE_GROUP_HELP, parseGrade, parseGroup } from "../../../shared/courses.js";
import { assertCanCreateCourses, rollbackCourseIfOverLimit } from "./account-limits.js";

const courseGroupInputSchema = z.object({
  grade: z.string().trim().min(1).max(64).refine((value) => parseGrade(value) !== null, GRADE_GROUP_HELP).transform((value) => parseGrade(value)!),
  group: z.string().trim().min(1).max(32).refine((value) => parseGroup(value) !== null, GRADE_GROUP_HELP).transform((value) => parseGroup(value)!),
  academicYear: z.coerce.number().int().min(2000).max(2200),
});

export type CourseGroupInput = z.infer<typeof courseGroupInputSchema>;
export { courseGroupInputSchema };

export async function listCourseGroups(context: AuthContext) {
  const groups = await CourseGroup.find({ institutionId: context.institution.id, active: true, ...(context.membership.role === "ADMIN" ? {} : { _id: { $in: context.membership.courseGroupIds } }) }).sort({ grade: 1, group: 1 });
  return groups.map((group) => ({
    id: group._id.toString(),
    grade: group.grade,
    group: group.group,
    academicYear: group.academicYear,
    label: `${group.grade} · ${group.group}`,
  }));
}

export async function createCourseGroup(context: AuthContext, input: CourseGroupInput) {
  // Docente: máximo 4 cursos; institución: máximo 5 docentes × 6 cursos.
  await assertCanCreateCourses(context);
  try {
    const group = await CourseGroup.create({
      institutionId: context.institution.id,
      grade: input.grade,
      gradeNormalized: normalizeForLookup(input.grade),
      group: input.group,
      groupNormalized: normalizeForLookup(input.group),
      academicYear: input.academicYear,
      active: true,
    });
    await rollbackCourseIfOverLimit(context, group._id);
    // Las materias dictadas en ese grado quedan disponibles también para el curso nuevo.
    await Subject.updateMany({ institutionId: context.institution.id, active: true, grades: group.grade }, { $addToSet: { courseGroupIds: group._id } });
    return {
      id: group._id.toString(),
      grade: group.grade,
      group: group.group,
      academicYear: group.academicYear,
      label: `${group.grade} · ${group.group}`,
    };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: number }).code === 11000) {
      throw conflict("Ya existe ese curso y grupo para el año académico indicado.");
    }
    throw error;
  }
}
