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

// El administrador de la plataforma puede reemplazar los límites por defecto de una cuenta concreta.
export interface LimitOverrides { courses?: number; teachers?: number; coursesPerTeacher?: number }
export interface EffectiveLimits { courses: number; teachers?: number; coursesPerTeacher?: number }

export function effectiveLimits(type: AccountType, overrides?: LimitOverrides | null): EffectiveLimits {
  if (type === "PERSONAL") return { courses: overrides?.courses ?? ACCOUNT_LIMITS.PERSONAL.courses };
  const teachers = overrides?.teachers ?? ACCOUNT_LIMITS.INSTITUTION.teachers;
  const coursesPerTeacher = overrides?.coursesPerTeacher ?? ACCOUNT_LIMITS.INSTITUTION.coursesPerTeacher;
  return { courses: overrides?.courses ?? teachers * coursesPerTeacher, teachers, coursesPerTeacher };
}
