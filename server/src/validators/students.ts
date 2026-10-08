import { z } from "zod";

const courseGroupIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, "Selecciona un grupo válido.");
const emailSchema = z.string().trim().email("El correo electrónico no es válido.").max(254);
const phoneSchema = z.string().trim().max(32);

export const studentInputSchema = z.object({
  firstName: z.string().trim().min(2, "Escribe el nombre del estudiante.").max(80),
  lastName: z.string().trim().min(2, "Escribe los apellidos del estudiante.").max(100),
  document: z.string().trim().min(3).max(64).optional().or(z.literal("")),
  courseGroupId: courseGroupIdSchema.optional(),
  email: emailSchema.optional().or(z.literal("")),
  phone: phoneSchema.optional(),
});

export const studentUpdateSchema = z
  .object({
    firstName: z.string().trim().min(2, "Escribe el nombre del estudiante.").max(80).optional(),
    lastName: z.string().trim().min(2, "Escribe los apellidos del estudiante.").max(100).optional(),
    document: z.string().trim().min(3, "Escribe el documento o código institucional.").max(64).optional(),
    courseGroupId: courseGroupIdSchema.nullable().optional(),
    email: emailSchema.or(z.literal("")).nullable().optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Incluye al menos un campo para actualizar.");

export const studentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVO", "INACTIVO", "TODOS"]).default("ACTIVO"),
  courseGroupId: courseGroupIdSchema.optional(),
});

export type StudentInput = z.infer<typeof studentInputSchema>;
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;
