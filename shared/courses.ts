// Grados y grupos permitidos: grado 1 a 11 (1 a 5 primaria, 6 a 11 secundaria) y grupo 1, 2 o 3.
export const GRADES = Array.from({ length: 11 }, (_, index) => String(index + 1));
export const GROUPS = ["1", "2", "3"];
export const GRADE_GROUP_HELP = "El grado va de 1 a 11 (1 a 5 primaria, 6 a 11 secundaria) y el grupo es 1, 2 o 3.";

// Acepta "6", "06", "6°" o "6º". Devuelve el grado canónico o null si no es válido.
export function parseGrade(value: string): string | null {
  const match = /^\s*0*(\d{1,2})\s*[°º]?\s*$/.exec(value);
  const grade = match ? String(Number(match[1])) : "";
  return GRADES.includes(grade) ? grade : null;
}
export function parseGroup(value: string): string | null {
  const group = value.trim();
  return GROUPS.includes(group) ? group : null;
}
export const gradeLabel = (grade: string) => (Number(grade) >= 6 ? "Secundaria" : "Primaria");
