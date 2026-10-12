import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Complaint, complaintRoles, complaintStatuses, complaintTypes } from "../models/index.js";
import { AppError } from "../utils/errors.js";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined);

export const complaintInput = z.object({
  type: z.enum(complaintTypes),
  requesterRole: z.enum(complaintRoles),
  name: z.string().trim().min(2, "Escribe tu nombre.").max(120),
  email: z.string().trim().email("Escribe un correo válido.").max(254),
  phone: optionalText(32),
  institutionName: optionalText(160),
  studentName: optionalText(160),
  message: z.string().trim().min(10, "Cuéntanos con más detalle (mínimo 10 caracteres).").max(4000),
  consent: z.literal(true, { errorMap: () => ({ message: "Debes autorizar el uso de estos datos para atender la solicitud." }) }),
  // Campo trampa para robots: una persona nunca lo llena.
  website: z.string().max(0).optional(),
}).strict();

export const complaintUpdate = z.object({
  status: z.enum(complaintStatuses),
  adminNote: z.string().trim().max(2000).optional(),
}).strict();

function newTicket(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return `Q-${[...bytes].map((b) => alphabet[b % alphabet.length]).join("")}`;
}

export async function createComplaint(input: z.infer<typeof complaintInput>) {
  const { consent: _consent, website: _website, ...data } = input;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await Complaint.create({ ...data, ticket: newTicket(), status: "NUEVA" });
      return { ticket: row.ticket, createdAt: row.createdAt?.toISOString() };
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  throw new AppError(503, "TICKET_UNAVAILABLE", "No se pudo registrar la solicitud. Inténtalo de nuevo.");
}

const dto = (row: { _id: unknown; ticket: string; type: string; requesterRole: string; name: string; email: string; phone?: string; institutionName?: string; studentName?: string; message: string; status: string; adminNote?: string; resolvedAt?: Date; createdAt?: Date; updatedAt?: Date }) => ({
  id: String(row._id), ticket: row.ticket, type: row.type, requesterRole: row.requesterRole, name: row.name, email: row.email, phone: row.phone,
  institutionName: row.institutionName, studentName: row.studentName, message: row.message, status: row.status, adminNote: row.adminNote,
  resolvedAt: row.resolvedAt?.toISOString(), createdAt: row.createdAt?.toISOString(), updatedAt: row.updatedAt?.toISOString(),
});

export async function listComplaints() {
  const [rows, counts] = await Promise.all([
    Complaint.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    Complaint.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const byStatus = Object.fromEntries(complaintStatuses.map((status) => [status, counts.find((row) => row._id === status)?.count ?? 0]));
  return { items: rows.map(dto), counts: byStatus };
}

export async function updateComplaint(id: string, input: z.infer<typeof complaintUpdate>) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new AppError(400, "VALIDATION_ERROR", "El identificador no es válido.");
  const row = await Complaint.findById(id);
  if (!row) throw new AppError(404, "NOT_FOUND", "No se encontró la solicitud.");
  row.status = input.status;
  if (input.adminNote !== undefined) row.adminNote = input.adminNote || undefined;
  row.resolvedAt = input.status === "RESUELTA" ? row.resolvedAt ?? new Date() : undefined;
  await row.save();
  return dto(row.toObject());
}
