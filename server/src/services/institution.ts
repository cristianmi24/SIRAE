import type { Types } from "mongoose";
import { CourseGroup, Membership, MembershipInvitation, Student } from "../models/index.js";
import { Attendance, ClassSession } from "../models/learning.js";
import type { AuthContext } from "./auth-context.js";
import { accountUsage } from "./account-limits.js";
import { forbiddenEntity, objectId, tenantId } from "./learning-common.js";

// Vista de la institución sobre sus docentes, cursos y estudiantes. Todo se filtra por la
// institución del administrador: nunca se consultan datos de otra institución.

type CountRow = { _id: unknown; count: number };
type SessionRow = { _id: Types.ObjectId; courseGroupId: Types.ObjectId; dateKey: string; startsAt: Date; endsAt: Date; state: "OPEN" | "CLOSED" };
type PersonRef = { _id: Types.ObjectId; displayName?: string; email?: string; lastSeenAt?: Date; lastLoginAt?: Date } | null;
const emptyCounter = () => ({ present: 0, late: 0, absent: 0, justified: 0, pending: 0 });
type Counter = ReturnType<typeof emptyCounter>;
const statusKey: Record<string, keyof Counter> = { PRESENT: "present", LATE: "late", ABSENT: "absent", JUSTIFIED: "justified", PENDING_REVIEW: "pending" };

// Mismo cálculo que el módulo de Análisis, para que institución y docente vean las mismas cifras.
function attendanceFigures(counter: Counter, totalSessions: number) {
  const absent = Math.min(totalSessions, Math.max(counter.absent, totalSessions - counter.present - counter.late - counter.justified - counter.pending));
  const denominator = Math.max(0, totalSessions - counter.pending);
  const attendancePercent = denominator ? Math.round((counter.present + counter.late + counter.justified) * 10000 / denominator) / 100 : undefined;
  return { ...counter, absent, attendancePercent };
}

async function sessionSummaries(institutionId: Types.ObjectId, sessions: SessionRow[]) {
  if (!sessions.length) return new Map<string, Counter>();
  const rows = await Attendance.aggregate<{ _id: { session: Types.ObjectId; status: string }; count: number }>([
    { $match: { institutionId, classSessionId: { $in: sessions.map((s) => s._id) } } },
    { $group: { _id: { session: "$classSessionId", status: "$status" }, count: { $sum: 1 } } },
  ]);
  const result = new Map<string, Counter>();
  for (const row of rows) {
    const key = String(row._id.session);
    const counter = result.get(key) ?? emptyCounter();
    const field = statusKey[row._id.status];
    if (field) counter[field] += row.count;
    result.set(key, counter);
  }
  return result;
}

export async function institutionOverview(context: AuthContext) {
  const institutionId = tenantId(context);
  const [memberships, courses, studentCounts, sessionCounts, recentSessions, pendingInvitations, plan] = await Promise.all([
    Membership.find({ institutionId, active: true }).populate("userId", "displayName email lastSeenAt lastLoginAt").sort({ createdAt: 1 }).lean(),
    CourseGroup.find({ institutionId, active: true }).sort({ grade: 1, group: 1 }).lean(),
    Student.aggregate<CountRow>([{ $match: { institutionId, active: true } }, { $group: { _id: "$courseGroupId", count: { $sum: 1 } } }]),
    ClassSession.aggregate<CountRow>([{ $match: { institutionId } }, { $group: { _id: "$courseGroupId", count: { $sum: 1 } } }]),
    ClassSession.find({ institutionId }).sort({ startsAt: -1 }).limit(300).select("courseGroupId dateKey startsAt endsAt state").lean<SessionRow[]>(),
    MembershipInvitation.find({ institutionId, acceptedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).limit(50).lean(),
    accountUsage(context),
  ]);
  const students = new Map(studentCounts.map((row) => [String(row._id), row.count]));
  const sessions = new Map(sessionCounts.map((row) => [String(row._id), row.count]));
  const latestByCourse = new Map<string, SessionRow>();
  for (const session of recentSessions) if (!latestByCourse.has(String(session.courseGroupId))) latestByCourse.set(String(session.courseGroupId), session);
  const latestSummaries = await sessionSummaries(institutionId, [...latestByCourse.values()]);
  const courseById = new Map(courses.map((course) => [String(course._id), course]));

  const courseDto = (id: string) => {
    const course = courseById.get(id);
    if (!course) return null;
    const latest = latestByCourse.get(id);
    return {
      id, label: `${course.grade} ${course.group}`, academicYear: course.academicYear,
      students: students.get(id) ?? 0, sessions: sessions.get(id) ?? 0,
      lastSession: latest ? { id: String(latest._id), dateKey: latest.dateKey, startsAt: latest.startsAt.toISOString(), state: latest.state, summary: latestSummaries.get(String(latest._id)) ?? emptyCounter() } : undefined,
    };
  };
  const person = (value: unknown) => value as PersonRef;
  const teachers = memberships.filter((row) => row.role === "DOCENTE" && person(row.userId)).map((row) => {
    const user = person(row.userId)!;
    const assigned = row.courseGroupIds.map(String).map(courseDto).filter((course): course is NonNullable<ReturnType<typeof courseDto>> => Boolean(course));
    return {
      membershipId: String(row._id), userId: String(user._id), name: user.displayName ?? "Docente", email: user.email,
      lastSeenAt: (user.lastSeenAt ?? user.lastLoginAt)?.toISOString(),
      courses: assigned, students: assigned.reduce((sum, course) => sum + course.students, 0),
    };
  });
  const assignedIds = new Set(teachers.flatMap((teacher) => teacher.courses.map((course) => course.id)));
  return {
    institution: { id: context.institution.id, name: context.institution.name, timezone: context.institution.timezone, type: context.institution.type ?? "PERSONAL" },
    plan,
    teachers,
    admins: memberships.filter((row) => row.role === "ADMIN" && person(row.userId)).map((row) => ({ membershipId: String(row._id), name: person(row.userId)!.displayName ?? "Administrador", email: person(row.userId)!.email })),
    unassignedCourses: courses.map((course) => String(course._id)).filter((id) => !assignedIds.has(id)).map(courseDto).filter(Boolean),
    pendingInvitations: pendingInvitations.map((row) => ({ id: String(row._id), email: row.email, role: row.role, courseGroupIds: row.courseGroupIds.map(String), expiresAt: row.expiresAt.toISOString() })),
    generatedAt: new Date().toISOString(),
  };
}

// Estudiantes de un curso de un docente, con su asistencia acumulada.
// Solo si el docente pertenece a esta institución y tiene ese curso asignado.
export async function institutionCourseStudents(context: AuthContext, membershipId: string, courseId: string) {
  const institutionId = tenantId(context);
  const courseGroupId = objectId(courseId);
  const membership = await Membership.findOne({ _id: objectId(membershipId), institutionId, role: "DOCENTE", active: true }).populate("userId", "displayName email").lean();
  if (!membership || !membership.courseGroupIds.some((id) => id.equals(courseGroupId))) throw forbiddenEntity();
  const course = await CourseGroup.findOne({ _id: courseGroupId, institutionId, active: true }).lean();
  if (!course) throw forbiddenEntity();
  const [students, totalSessions, latest] = await Promise.all([
    Student.find({ institutionId, courseGroupId, active: true }).sort({ lastName: 1, firstName: 1 }).select("firstName lastName document").lean(),
    ClassSession.countDocuments({ institutionId, courseGroupId }),
    ClassSession.findOne({ institutionId, courseGroupId }).sort({ startsAt: -1 }).select("courseGroupId dateKey startsAt endsAt state").lean<SessionRow | null>(),
  ]);
  const studentIds = students.map((student) => student._id);
  const [totals, latestRows] = await Promise.all([
    studentIds.length ? Attendance.aggregate<{ _id: { student: Types.ObjectId; status: string }; count: number }>([
      { $match: { institutionId, courseGroupId, studentId: { $in: studentIds } } },
      { $group: { _id: { student: "$studentId", status: "$status" }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    latest ? Attendance.find({ institutionId, classSessionId: latest._id }).select("studentId status recordedAt").lean() : Promise.resolve([]),
  ]);
  const counters = new Map<string, Counter>();
  for (const row of totals) {
    const key = String(row._id.student);
    const counter = counters.get(key) ?? emptyCounter();
    const field = statusKey[row._id.status];
    if (field) counter[field] += row.count;
    counters.set(key, counter);
  }
  const latestByStudent = new Map(latestRows.map((row) => [String(row.studentId), row]));
  const teacher = membership.userId as unknown as PersonRef;
  return {
    teacher: { membershipId: String(membership._id), name: teacher?.displayName ?? "Docente", email: teacher?.email },
    course: { id: String(course._id), label: `${course.grade} ${course.group}`, academicYear: course.academicYear },
    totalSessions,
    lastSession: latest ? { id: String(latest._id), dateKey: latest.dateKey, startsAt: latest.startsAt.toISOString(), state: latest.state } : undefined,
    students: students.map((student) => {
      const id = String(student._id);
      const last = latestByStudent.get(id);
      return { id, name: `${student.firstName} ${student.lastName}`, code: student.document, ...attendanceFigures(counters.get(id) ?? emptyCounter(), totalSessions), lastStatus: last?.status, lastRecordedAt: last?.recordedAt?.toISOString() };
    }),
    generatedAt: new Date().toISOString(),
  };
}
