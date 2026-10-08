import type { Types } from "mongoose";
import { CourseGroup, Enrollment, Membership, Student } from "../models/index.js";
import { Assessment, Attendance, AttendanceLinkEvent, ClassSession, Grade, GradeCategory, Observation, Schedule, ScheduleBreak, Subject } from "../models/learning.js";
import type { AuthContext } from "./auth-context.js";
import { assertGroupAccess, audit, forbiddenEntity, objectId, tenantId } from "./learning-common.js";
import { AppError } from "../utils/errors.js";

// Borrado definitivo: elimina también la asistencia, notas y observaciones asociadas.
async function purgeStudents(institutionId: Types.ObjectId, studentIds: Types.ObjectId[]) {
  if (!studentIds.length) return;
  const filter = { institutionId, studentId: { $in: studentIds } };
  await Promise.all([Attendance.deleteMany(filter), Grade.deleteMany(filter), Observation.deleteMany(filter), Enrollment.deleteMany(filter), AttendanceLinkEvent.deleteMany(filter)]);
  await Student.deleteMany({ institutionId, _id: { $in: studentIds } });
}

export async function deleteStudent(context: AuthContext, id: string) {
  const student = await Student.findOne({ _id: objectId(id), institutionId: tenantId(context) }).lean();
  if (!student) throw forbiddenEntity();
  if (student.courseGroupId) assertGroupAccess(context, String(student.courseGroupId));
  else if (context.membership.role !== "ADMIN") throw forbiddenEntity();
  await purgeStudents(tenantId(context), [student._id]);
  await audit(context, "STUDENT_DELETED", "Student", student._id, { name: `${student.firstName} ${student.lastName}` }, undefined);
  return { deleted: 1 };
}

async function purgeCourses(institutionId: Types.ObjectId, courseIds: Types.ObjectId[]) {
  const students = await Student.find({ institutionId, courseGroupId: { $in: courseIds } }).select("_id").lean();
  await purgeStudents(institutionId, students.map((s) => s._id));
  const sessions = await ClassSession.find({ institutionId, courseGroupId: { $in: courseIds } }).select("_id").lean();
  const sessionIds = sessions.map((s) => s._id);
  await Promise.all([
    Attendance.deleteMany({ institutionId, classSessionId: { $in: sessionIds } }),
    AttendanceLinkEvent.deleteMany({ institutionId, classSessionId: { $in: sessionIds } }),
    ClassSession.deleteMany({ institutionId, _id: { $in: sessionIds } }),
    Schedule.deleteMany({ institutionId, courseGroupId: { $in: courseIds } }),
    ScheduleBreak.deleteMany({ institutionId, courseGroupId: { $in: courseIds } }),
    Subject.updateMany({ institutionId }, { $pull: { courseGroupIds: { $in: courseIds } } }),
    Membership.updateMany({ institutionId }, { $pull: { courseGroupIds: { $in: courseIds } } }),
  ]);
  await CourseGroup.deleteMany({ institutionId, _id: { $in: courseIds } });
  return students.length;
}

export async function deleteCourse(context: AuthContext, id: string) {
  if (context.membership.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Solo el dueño del aula puede eliminar cursos.");
  const course = await CourseGroup.findOne({ _id: objectId(id), institutionId: tenantId(context) }).lean();
  if (!course) throw forbiddenEntity();
  const students = await purgeCourses(tenantId(context), [course._id]);
  await audit(context, "COURSE_GROUP_DELETED", "CourseGroup", course._id, { label: `${course.grade} ${course.group}` }, { studentsDeleted: students });
  return { deletedStudents: students };
}

// "Eliminar todo": estudiantes, cursos, asignaturas, horarios, clases, notas y observaciones.
// Se conservan los periodos, la configuración y las cuentas de docentes.
export async function deleteEverything(context: AuthContext, confirmation: string) {
  if (context.membership.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Solo el dueño del aula puede eliminar todo.");
  if (confirmation !== "ELIMINAR") throw new AppError(400, "CONFIRMATION_REQUIRED", "Escribe ELIMINAR para confirmar.");
  const institutionId = tenantId(context);
  const courses = await CourseGroup.find({ institutionId }).select("_id").lean();
  const courseStudents = await purgeCourses(institutionId, courses.map((c) => c._id));
  const loose = await Student.find({ institutionId }).select("_id").lean();
  await purgeStudents(institutionId, loose.map((s) => s._id));
  await Promise.all([Subject.deleteMany({ institutionId }), GradeCategory.deleteMany({ institutionId }), Assessment.deleteMany({ institutionId }), ScheduleBreak.deleteMany({ institutionId }), Schedule.deleteMany({ institutionId }), Observation.deleteMany({ institutionId })]);
  const deletedStudents = courseStudents + loose.length;
  await audit(context, "CLASSROOM_DATA_DELETED", "Institution", institutionId, undefined, { courses: courses.length, students: deletedStudents });
  return { deletedStudents, deletedCourses: courses.length };
}
