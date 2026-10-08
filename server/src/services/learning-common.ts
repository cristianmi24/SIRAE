import mongoose from "mongoose";
import { AuditLog } from "../models/index.js";
import type { AuthContext } from "./auth-context.js";
import { AppError } from "../utils/errors.js";

export function objectId(value: string, label = "identificador"): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) throw new AppError(400, "VALIDATION_ERROR", `El ${label} no es válido.`);
  return new mongoose.Types.ObjectId(value);
}
export function tenantId(context: AuthContext): mongoose.Types.ObjectId { return objectId(context.institution.id, "institución"); }
export function actorId(context: AuthContext): mongoose.Types.ObjectId { return objectId(context.user.id, "usuario"); }
export function assertGroupAccess(context: AuthContext, groupId: string): void {
  if (context.membership.role !== "ADMIN" && !context.membership.courseGroupIds.includes(groupId)) throw new AppError(403, "FORBIDDEN", "No tienes acceso a este grupo.");
}
export function forbiddenEntity(): AppError { return new AppError(404, "NOT_FOUND", "No se encontró el registro solicitado en esta institución."); }
export async function audit(context: AuthContext, action: string, entityType: string, entityId: mongoose.Types.ObjectId, before?: Record<string, unknown>, after?: Record<string, unknown>, metadata?: Record<string, unknown>): Promise<void> {
  await AuditLog.create({ institutionId: tenantId(context), actorUserId: actorId(context), action, entityType, entityId, before, after, metadata });
}
export function safeId(value: unknown): string { return value && typeof value === "object" && "toString" in value ? String(value) : ""; }
