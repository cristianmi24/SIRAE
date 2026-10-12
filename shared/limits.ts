// Límites de capacidad por tipo de cuenta. Se usan tanto en la interfaz como en el servidor;
// el servidor es quien los hace cumplir.
export type AccountType = "PERSONAL" | "INSTITUTION";

export const ADMIN_CONTACT_EMAIL = "cpenataandrades2023@gmail.com";

export const ACCOUNT_LIMITS = {
  // Cuenta de docente: un aula individual.
  PERSONAL: { courses: 4 },
  // Cuenta de institución: hasta 5 docentes, cada uno con hasta 6 cursos asignados.
  // El total de cursos de la institución no puede superar 5 × 6.
  INSTITUTION: { teachers: 5, coursesPerTeacher: 6, courses: 5 * 6 },
} as const;

export const accountTypeLabel = (type: AccountType) => (type === "INSTITUTION" ? "Institución" : "Docente");

export function capacityRequestMailto(subject: string, body: string): string {
  return `mailto:${ADMIN_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
