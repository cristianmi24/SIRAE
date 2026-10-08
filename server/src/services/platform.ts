import type { NextFunction, Request, Response } from "express";
import { AuditLog, CourseGroup, Institution, Membership, Student, User } from "../models/index.js";
import { ClassSession, Grade, Observation } from "../models/learning.js";
import { forbidden } from "../utils/errors.js";
import type { AuthContext } from "./auth-context.js";

// La cuenta configurada en AULANEXO_ADMIN_EMAIL es un perfil de monitoreo de toda la plataforma.
export function isPlatformAdminEmail(email?: string): boolean {
  const configured = process.env.AULANEXO_ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(configured && email && email.toLowerCase() === configured);
}

export function requirePlatformAdmin(request: Request, _response: Response, next: NextFunction): void {
  if (!request.auth || !isPlatformAdminEmail(request.auth.user.email)) { next(forbidden("Esta vista es solo para el administrador de la plataforma.")); return; }
  next();
}

// El perfil de monitoreo solo consulta: no toma asistencia ni modifica datos académicos.
export function blockPlatformAdminWrites(request: Request, _response: Response, next: NextFunction): void {
  if (request.method !== "GET" && request.method !== "HEAD" && request.auth && isPlatformAdminEmail(request.auth.user.email)) {
    next(forbidden("El administrador tiene un perfil de monitoreo y no puede modificar datos de las aulas."));
    return;
  }
  next();
}

const SEEN_THROTTLE_MS = 5 * 60 * 1000;
export async function touchLastSeen(userId: string, lastSeenAt?: Date): Promise<void> {
  if (lastSeenAt && Date.now() - lastSeenAt.getTime() < SEEN_THROTTLE_MS) return;
  await User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } });
}

type CountRow = { _id: unknown; count: number };
const byId = (rows: CountRow[]) => new Map(rows.map((row) => [String(row._id), row.count]));

export async function platformOverview(_context: AuthContext) {
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [institutions, users, memberships, studentsBy, activeStudentsBy, coursesBy, sessionsBy, lastActivity, gradeCount, observationCount] = await Promise.all([
    Institution.find({}).sort({ createdAt: -1 }).lean(),
    User.find({}).sort({ createdAt: -1 }).lean(),
    Membership.find({ active: true }).lean(),
    Student.aggregate<CountRow>([{ $group: { _id: "$institutionId", count: { $sum: 1 } } }]),
    Student.aggregate<CountRow>([{ $match: { active: true } }, { $group: { _id: "$institutionId", count: { $sum: 1 } } }]),
    CourseGroup.aggregate<CountRow>([{ $match: { active: true } }, { $group: { _id: "$institutionId", count: { $sum: 1 } } }]),
    ClassSession.aggregate<CountRow>([{ $group: { _id: "$institutionId", count: { $sum: 1 } } }]),
    AuditLog.aggregate<{ _id: unknown; at: Date }>([{ $group: { _id: "$institutionId", at: { $max: "$createdAt" } } }]),
    Grade.countDocuments({ active: true }),
    Observation.countDocuments({}),
  ]);
  const students = byId(studentsBy); const activeStudents = byId(activeStudentsBy); const courses = byId(coursesBy); const sessions = byId(sessionsBy);
  const activity = new Map(lastActivity.map((row) => [String(row._id), row.at]));
  const institutionById = new Map(institutions.map((row) => [String(row._id), row]));
  const userById = new Map(users.map((row) => [String(row._id), row]));
  const membersByInstitution = new Map<string, number>();
  for (const membership of memberships) membersByInstitution.set(String(membership.institutionId), (membersByInstitution.get(String(membership.institutionId)) ?? 0) + 1);

  const teacherRows = users.filter((user) => !isPlatformAdminEmail(user.email)).map((user) => {
    const membership = memberships.find((row) => String(row.userId) === String(user._id));
    const institution = membership ? institutionById.get(String(membership.institutionId)) : undefined;
    const institutionId = institution ? String(institution._id) : "";
    return {
      id: String(user._id), name: user.displayName, email: user.email, active: user.active,
      createdAt: user.createdAt?.toISOString(), lastSeenAt: (user.lastSeenAt ?? user.lastLoginAt)?.toISOString(), lastLoginAt: user.lastLoginAt?.toISOString(),
      institutionName: institution?.name, institutionType: institution?.type, role: membership?.role,
      students: institutionId ? activeStudents.get(institutionId) ?? 0 : 0, courses: institutionId ? courses.get(institutionId) ?? 0 : 0, sessions: institutionId ? sessions.get(institutionId) ?? 0 : 0,
    };
  });
  const institutionRows = institutions.map((row) => {
    const id = String(row._id);
    return { id, name: row.name, type: row.type, active: row.active, owner: row.ownerUserId ? userById.get(String(row.ownerUserId))?.displayName : undefined, createdAt: row.createdAt?.toISOString(), members: membersByInstitution.get(id) ?? 0, students: activeStudents.get(id) ?? 0, totalStudents: students.get(id) ?? 0, courses: courses.get(id) ?? 0, sessions: sessions.get(id) ?? 0, lastActivityAt: activity.get(id)?.toISOString() };
  });
  return {
    totals: {
      institutions: institutions.filter((row) => row.type === "INSTITUTION").length,
      personalClassrooms: institutions.filter((row) => row.type === "PERSONAL").length,
      teachers: teacherRows.length,
      activeTeachers7d: teacherRows.filter((row) => row.lastSeenAt && new Date(row.lastSeenAt) >= since7).length,
      activeTeachers30d: teacherRows.filter((row) => row.lastSeenAt && new Date(row.lastSeenAt) >= since30).length,
      students: [...activeStudents.values()].reduce((sum, value) => sum + value, 0),
      courses: [...courses.values()].reduce((sum, value) => sum + value, 0),
      sessions: [...sessions.values()].reduce((sum, value) => sum + value, 0),
      grades: gradeCount,
      observations: observationCount,
    },
    teachers: teacherRows,
    institutions: institutionRows,
  };
}
