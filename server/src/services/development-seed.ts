import { getEnvironment } from "../config/env.js";
import { CourseGroup, Enrollment, Student } from "../models/index.js";
import type { AuthContext } from "./auth-context.js";
import { createOpaqueQrToken, createQrPayload, hashQrPayload } from "../utils/qr.js";
import { normalizeForLookup } from "../utils/text.js";
import { forbidden } from "../utils/errors.js";

const sampleStudents = [
  ["Valentina", "Mora", "DEMO-1001", "8", "A"],
  ["Mateo", "Rojas", "DEMO-1002", "8", "A"],
  ["Sofía", "Castro", "DEMO-1003", "8", "A"],
  ["Samuel", "Gómez", "DEMO-1004", "8", "A"],
  ["Isabella", "Duarte", "DEMO-1005", "8", "A"],
  ["Nicolás", "Luna", "DEMO-2001", "8", "B"],
  ["Emma", "Herrera", "DEMO-2002", "8", "B"],
  ["Thiago", "Vargas", "DEMO-2003", "8", "B"],
  ["Martina", "Santos", "DEMO-2004", "8", "B"],
  ["Gabriel", "Pineda", "DEMO-2005", "8", "B"],
] as const;

export async function seedDevelopmentData(context: AuthContext) {
  if (getEnvironment().NODE_ENV === "production") {
    throw forbidden("Los datos ficticios solo se pueden cargar en desarrollo.");
  }

  const academicYear = new Date().getFullYear();
  const groups = new Map<string, string>();
  for (const [, , , grade, group] of sampleStudents) {
    const key = `${grade}-${group}`;
    const courseGroup = await CourseGroup.findOneAndUpdate(
      {
        institutionId: context.institution.id,
        gradeNormalized: normalizeForLookup(grade),
        groupNormalized: normalizeForLookup(group),
        academicYear,
      },
      {
        $setOnInsert: {
          institutionId: context.institution.id,
          grade,
          gradeNormalized: normalizeForLookup(grade),
          group,
          groupNormalized: normalizeForLookup(group),
          academicYear,
          active: true,
        },
      },
      { new: true, upsert: true },
    );
    groups.set(key, courseGroup._id.toString());
  }

  let created = 0;
  for (const [firstName, lastName, document, grade, group] of sampleStudents) {
    const documentNormalized = normalizeForLookup(document);
    const exists = await Student.findOne({ institutionId: context.institution.id, documentNormalized });
    const courseGroupId = groups.get(`${grade}-${group}`);
    if (exists) {
      if (courseGroupId) {
        await Enrollment.updateOne(
          { institutionId: context.institution.id, studentId: exists._id, courseGroupId, active: true },
          { $setOnInsert: { startsOn: new Date(), active: true } },
          { upsert: true },
        );
      }
      continue;
    }

    const token = createOpaqueQrToken();
    const student = await Student.create({
      institutionId: context.institution.id,
      firstName,
      lastName,
      document,
      documentNormalized,
      courseGroupId,
      active: true,
      qrTokenHash: hashQrPayload(createQrPayload(token)),
      qrVersion: 1,
      createdBy: context.user.id,
    });
    if (courseGroupId) {
      await Enrollment.create({
        institutionId: context.institution.id,
        studentId: student._id,
        courseGroupId,
        startsOn: new Date(),
        active: true,
      });
    }
    created += 1;
  }

  return { created, courseGroups: groups.size, totalFixtures: sampleStudents.length };
}
