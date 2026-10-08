import type { Request } from "express";
import type { MembershipRole } from "../../../shared/types.js";
import { Institution, Membership, MembershipInvitation, User } from "../models/index.js";
import { forbidden, unavailable } from "../utils/errors.js";
import { getSessionIdentity, type SessionIdentity } from "./local-auth.js";
import { touchLastSeen } from "./platform.js";

export interface AuthContext {
  identity: SessionIdentity;
  user: { id: string; name: string; email: string };
  membership: { id: string; role: MembershipRole; courseGroupIds: string[] };
  institution: { id: string; name: string; timezone: string };
}

export async function resolveAuthenticatedContext(request: Request): Promise<AuthContext> {
  const identity = await getSessionIdentity(request);
  const user = await User.findOne({ authId: identity.authId, active: true }).select("+passwordHash");
  if (!user) throw forbidden("La sesión pertenece a una cuenta inexistente o inactiva.");
  void touchLastSeen(user._id.toString(), user.lastSeenAt).catch(() => undefined);
  let membership = await Membership.findOne({ userId: user._id, active: true });
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
    institution: { id: institution._id.toString(), name: institution.name, timezone: institution.timezone },
  };
}
