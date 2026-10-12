import type { ComplaintRole, ComplaintStatus, ComplaintType } from "../../services/api";

export const complaintTypeLabel: Record<ComplaintType, string> = {
  QUEJA: "Queja",
  RECLAMO: "Reclamo",
  ELIMINACION_DATOS: "Eliminación de datos de un estudiante",
  PETICION: "Petición o solicitud",
  OTRO: "Otro",
};
export const complaintRoleLabel: Record<ComplaintRole, string> = {
  PADRE_ACUDIENTE: "Padre, madre o acudiente",
  ESTUDIANTE: "Estudiante",
  DOCENTE: "Docente",
  INSTITUCION: "Institución educativa",
  OTRO: "Otra persona",
};
export const complaintStatusLabel: Record<ComplaintStatus, string> = { NUEVA: "Nueva", EN_REVISION: "En revisión", RESUELTA: "Resuelta" };
