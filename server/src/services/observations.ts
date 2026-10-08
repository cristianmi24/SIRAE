import type { ObjectId } from "mongodb";
import { Student } from "../models/index.js";
import { Observation } from "../models/learning.js";
import type { AuthContext } from "./auth-context.js";
import { actorId, assertGroupAccess, audit, forbiddenEntity, objectId, tenantId } from "./learning-common.js";
export async function createObservation(context: AuthContext, input: { studentId: string; type: string; description: string; priority: "LOW" | "NORMAL" | "HIGH"; followUp?: string; status: "OPEN" | "IN_PROGRESS" | "CLOSED"; observedAt?: string }) {
  const student = await Student.findOne({ _id: objectId(input.studentId), institutionId: tenantId(context), active: true });
  if (!student) throw forbiddenEntity();
  if (context.membership.role === "DOCENTE" && (!student.courseGroupId || !context.membership.courseGroupIds.includes(String(student.courseGroupId)))) throw forbiddenEntity();
  if (student.courseGroupId) assertGroupAccess(context, String(student.courseGroupId));
  const row = await Observation.create({ institutionId: tenantId(context), studentId: student._id, type: input.type, description: input.description, teacherUserId: actorId(context), priority: input.priority, followUp: input.followUp, status: input.status, observedAt: input.observedAt ? new Date(input.observedAt) : new Date() });
  await audit(context, "OBSERVATION_CREATED", "Observation", row._id, undefined, { studentId: String(student._id), type: row.type, priority: row.priority });
  return { id: String(row._id), studentId: String(student._id), type: row.type, description: row.description, priority: row.priority, followUp: row.followUp, status: row.status, observedAt: row.observedAt.toISOString() };
}
export async function listObservations(context: AuthContext, studentId?: string) {
  const filter: Record<string, unknown> = { institutionId: tenantId(context) };
  if (studentId) filter.studentId = objectId(studentId);
  if (context.membership.role === "DOCENTE") { const accessible = await Student.find({ institutionId: tenantId(context), active: true, courseGroupId: { $in: context.membership.courseGroupIds.map((value) => objectId(value)) } }).select("_id").lean(); filter.studentId = { $in: accessible.map((x) => x._id) }; }
  const rows = await Observation.find(filter).sort({ observedAt: -1 }).limit(500).populate({ path: "studentId", select: "firstName lastName courseGroupId", match: { institutionId: tenantId(context) } }).lean();
  return rows.filter((x) => x.studentId).map((x) => { const student = x.studentId as unknown as { _id: ObjectId; firstName: string; lastName: string }; return { id: String(x._id), studentId: String(student._id), studentName: `${student.firstName} ${student.lastName}`, type: x.type, description: x.description, priority: x.priority, followUp: x.followUp, status: x.status, observedAt: x.observedAt.toISOString() }; });
}
