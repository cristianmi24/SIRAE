import { CourseGroup, Institution } from "../models/index.js";
import type { AuthContext } from "./auth-context.js";
import { conflict } from "../utils/errors.js";
import { normalizeForLookup } from "../utils/text.js";
import { z } from "zod";

const courseGroupInputSchema = z.object({
  grade: z.string().trim().min(1).max(64),
  group: z.string().trim().min(1).max(32),
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
  const institution = await Institution.findById(context.institution.id).select("type");
  if (institution?.type === "PERSONAL" && await CourseGroup.countDocuments({ institutionId: context.institution.id, active: true }) >= 6) {
    throw conflict("El aula personal permite un máximo de 6 cursos.");
  }
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
