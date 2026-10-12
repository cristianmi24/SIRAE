import type { Request } from "express";
import type { Types } from "mongoose";
import type { MembershipRole } from "../../../shared/types.js";
import type { AccountType, LimitOverrides } from "../../../shared/limits.js";
import { Institution, Membership, MembershipInvitation, User } from "../models/index.js";
import { forbidden, unavailable } from "../utils/errors.js";
import { getSessionIdentity, type SessionIdentity } from "./local-auth.js";
import { touchLastSeen } from "./platform.js";

export interface AuthContext {
  identity: SessionIdentity;
  user: { id: string; name: string; email: string };
  membership: { id: string; role: MembershipRole; courseGroupIds: string[] };
  institution: { id: string; name: string; timezone: string; type?: AccountType; limits?: LimitOverrides };
}

// Una persona puede pertenecer a más de un espacio (su aula y una institución que la invitó).
// Se usa el que eligió (activeInstitutionId); si no eligió ninguno, el más antiguo, como antes.
async function pickMembership(userId: Types.ObjectId, activeInstitutionId?: Types.ObjectId) {
  const memberships = await Membership.find({ userId, active: true }).sort({ createdAt: 1, _id: 1 });
  if (!memberships.length) return null;
  return memberships.find((row) => activeInstitutionId && row.institutionId.equals(activeInstitutionId)) ?? memberships[0]!;
}

export async function resolveAuthenticatedContext(request: Request): Promise<AuthContext> {
  const identity = await getSessionIdentity(request);
  const user = await User.findOne({ authId: identity.authId, active: true }).select("+passwordHash");
  if (!user) throw forbidden("La sesión pertenece a una cuenta inexistente o inactiva.");
  void touchLastSeen(user._id.toString(), user.lastSeenAt).catch(() => undefined);
  let membership = await pickMembership(user._id, user.activeInstitutionId);
  if (!membership && user.email) {
    const invitation = await MembershipInvitation.findOne({ email: user.email.toLowerCase(), acceptedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 });
    if (invitation) {
      membership = await Membership.findOneAndUpdate(
        { userId: user._id, institutionId: invitation.institutionId },
        { $setOnInsert: { userId: user._id, institutionId: invitation.institutionId, role: invitation.role, active: true, courseGroupIds: invitation.courseGroupIds } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      invitation.acceptedAt = new Date(); invitation.acceptedBy = user._id; await invitation.save();
    }
  }
  if (!membership) throw forbidden("Tu cuenta no tiene una institución asignada. Solicita acceso a un administrador.");
  const institution = await Institution.findOne({ _id: membership.institutionId, active: true });
  if (!institution) throw unavailable("La institución asignada no está disponible.");
  return {
    identity,
    user: { id: user._id.toString(), name: user.displayName, email: user.email },
    membership: { id: membership._id.toString(), role: membership.role, courseGroupIds: membership.courseGroupIds.map((id) => id.toString()) },
    institution: { id: institution._id.toString(), name: institution.name, timezone: institution.timezone, type: institution.type, limits: institution.limits ? { courses: institution.limits.courses ?? undefined, teachers: institution.limits.teachers ?? undefined, coursesPerTeacher: institution.limits.coursesPerTeacher ?? undefined } : undefined },
  };
}

// Espacios a los que pertenece la persona, para poder cambiar entre ellos.
export async function listUserWorkspaces(userId: string) {
  const memberships = await Membership.find({ userId, active: true }).sort({ createdAt: 1, _id: 1 }).populate("institutionId", "name type active").lean();
  return memberships
    .map((row) => ({ row, institution: row.institutionId as unknown as { _id: Types.ObjectId; name: string; type: AccountType; active: boolean } | null }))
    .filter((x) => x.institution?.active)
    .map(({ row, institution }) => ({ institutionId: String(institution!._id), name: institution!.name, type: institution!.type, role: row.role }));
}
