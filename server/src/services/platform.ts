import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { effectiveLimits } from "../../../shared/limits.js";
import { AuditLog, CourseGroup, Institution, Membership, MembershipInvitation, Student, User } from "../models/index.js";
import { ClassSession, Grade, Observation } from "../models/learning.js";
import { conflict, forbidden, notFound } from "../utils/errors.js";
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
    return { id, name: row.name, type: row.type, active: row.active, owner: row.ownerUserId ? userById.get(String(row.ownerUserId))?.displayName : undefined, ownerEmail: row.ownerUserId ? userById.get(String(row.ownerUserId))?.email : undefined, createdAt: row.createdAt?.toISOString(), limits: effectiveLimits(row.type, row.limits), customLimits: Boolean(row.limits && (row.limits.courses || row.limits.teachers || row.limits.coursesPerTeacher)), members: membersByInstitution.get(id) ?? 0, students: activeStudents.get(id) ?? 0, totalStudents: students.get(id) ?? 0, courses: courses.get(id) ?? 0, sessions: sessions.get(id) ?? 0, lastActivityAt: activity.get(id)?.toISOString() };
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

const limitField = (max: number) => z.number().int().min(1).max(max).nullable().optional();
const limitsInput = z.object({ courses: limitField(100000), teachers: limitField(10000), coursesPerTeacher: limitField(1000) }).strict();
export const platformInstitutionInput = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(["INSTITUTION", "PERSONAL"]).default("INSTITUTION"),
  adminEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),
  limits: limitsInput.optional(),
}).strict();
export const platformInstitutionPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  active: z.boolean().optional(),
  limits: limitsInput.optional(),
}).strict();

// null o ausente quita el reemplazo y vuelve al límite por defecto.
function limitsUpdate(limits: z.infer<typeof limitsInput>) {
  const set: Record<string, number> = {}; const unset: Record<string, 1> = {};
  for (const key of ["courses", "teachers", "coursesPerTeacher"] as const) {
    const value = limits[key];
    if (typeof value === "number") set[`limits.${key}`] = value; else if (value === null) unset[`limits.${key}`] = 1;
  }
  return { set, unset };
}

export async function createPlatformInstitution(context: AuthContext, input: z.infer<typeof platformInstitutionInput>) {
  const limits = limitsUpdate(input.limits ?? {}).set;
  const institution = await Institution.create({
    name: input.name, type: input.type, timezone: "America/Bogota", active: true,
    ...(Object.keys(limits).length ? { limits: Object.fromEntries(Object.entries(limits).map(([key, value]) => [key.replace("limits.", ""), value])) } : {}),
  });
  let adminStatus: "NONE" | "ASSIGNED" | "INVITED" = "NONE";
  if (input.adminEmail) {
    const existing = await User.findOne({ email: input.adminEmail, active: true });
    if (existing) {
      await Membership.findOneAndUpdate({ userId: existing._id, institutionId: institution._id }, { $setOnInsert: { role: "ADMIN", active: true, courseGroupIds: [] } }, { upsert: true, setDefaultsOnInsert: true });
      if (!institution.ownerUserId) await Institution.updateOne({ _id: institution._id }, { $set: { ownerUserId: existing._id } });
      adminStatus = "ASSIGNED";
    } else {
      await MembershipInvitation.create({ institutionId: institution._id, email: input.adminEmail, role: "ADMIN", courseGroupIds: [], invitedBy: new Types.ObjectId(context.user.id), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
      adminStatus = "INVITED";
    }
  }
  return { id: String(institution._id), name: institution.name, adminStatus };
}

export async function updatePlatformInstitution(id: string, input: z.infer<typeof platformInstitutionPatch>) {
  if (!Types.ObjectId.isValid(id)) throw notFound("No se encontró la institución.");
  const institution = await Institution.findById(id);
  if (!institution) throw notFound("No se encontró la institución.");
  const { set: limitSet, unset } = limitsUpdate(input.limits ?? {}); const set: Record<string, unknown> = { ...limitSet };
  if (input.name !== undefined) set.name = input.name;
  if (input.active !== undefined) set.active = input.active;
  if (!Object.keys(set).length && !Object.keys(unset).length) throw conflict("No hay cambios para guardar.");
  await Institution.updateOne({ _id: institution._id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  return { id };
}

// Administradores de cada institución o aula (rol ADMIN), más las invitaciones de administrador pendientes.
export async function platformAdmins() {
  const [memberships, invitations] = await Promise.all([
    Membership.find({ role: "ADMIN", active: true }).populate("userId", "displayName email active lastSeenAt lastLoginAt createdAt").populate("institutionId", "name type active").lean(),
    MembershipInvitation.find({ role: "ADMIN", acceptedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).populate("institutionId", "name type active").lean(),
  ]);
  type U = { _id: Types.ObjectId; displayName: string; email: string; active: boolean; lastSeenAt?: Date; lastLoginAt?: Date; createdAt?: Date } | null;
  type I = { _id: Types.ObjectId; name: string; type: "PERSONAL" | "INSTITUTION"; active: boolean } | null;
  const admins = memberships.map((row) => ({ user: row.userId as unknown as U, institution: row.institutionId as unknown as I }))
    .filter((row): row is { user: NonNullable<U>; institution: NonNullable<I> } => Boolean(row.user && row.institution) && !isPlatformAdminEmail(row.user!.email))
    .map(({ user, institution }) => ({
      id: String(user._id), name: user.displayName, email: user.email, active: user.active,
      institutionId: String(institution._id), institutionName: institution.name, institutionType: institution.type, institutionActive: institution.active,
      createdAt: user.createdAt?.toISOString(), lastSeenAt: (user.lastSeenAt ?? user.lastLoginAt)?.toISOString(),
    }))
    .sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));
  const pending = invitations.map((row) => ({ id: String(row._id), email: row.email, institutionName: (row.institutionId as unknown as I)?.name ?? "—", expiresAt: row.expiresAt.toISOString() }));
  return { admins, pending };
}
