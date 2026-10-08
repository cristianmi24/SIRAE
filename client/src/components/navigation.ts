import { Activity, BarChart3, BookOpenText, CalendarClock, FileBarChart2, Home, NotebookPen, QrCode, Settings2, ShieldCheck, Users, type LucideIcon } from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; tone: string; step?: number; shortcut?: string };
export type NavSection = { title: string; items: NavItem[] };

// El orden sigue el flujo real: primero se cargan estudiantes (eso crea los cursos),
// luego materias y horarios, y después el trabajo diario y los resultados.
export const home: NavItem = { to: "/", label: "Inicio", icon: Home, tone: "sun", shortcut: "1" };
export const monitoring: NavItem = { to: "/", label: "Monitoreo", icon: Activity, tone: "teal", shortcut: "1" };
export const sections: NavSection[] = [
  { title: "Preparar el aula", items: [
    { to: "/students", label: "Estudiantes", icon: Users, tone: "blue", step: 1, shortcut: "2" },
    { to: "/academic", label: "Notas", icon: NotebookPen, tone: "violet", step: 2, shortcut: "3" },
    { to: "/academic/schedules", label: "Horarios", icon: CalendarClock, tone: "amber", step: 3, shortcut: "4" },
  ] },
  { title: "Día a día", items: [
    { to: "/attendance", label: "Asistencia", icon: QrCode, tone: "green", step: 4, shortcut: "5" },
    { to: "/observations", label: "Seguimiento", icon: BookOpenText, tone: "coral", step: 5, shortcut: "6" },
  ] },
  { title: "Resultados", items: [
    { to: "/analytics", label: "Análisis", icon: BarChart3, tone: "teal", shortcut: "7" },
    { to: "/reports", label: "Reportes PDF", icon: FileBarChart2, tone: "pink", shortcut: "8" },
  ] },
];
export const adminItems: NavItem[] = [
  { to: "/settings", label: "Configuración", icon: Settings2, tone: "slate" },
  { to: "/audit", label: "Auditoría", icon: ShieldCheck, tone: "slate" },
];

export function navItemsFor(user: { role: string | null; platformAdmin?: boolean }): NavItem[] {
  if (user.platformAdmin) return [monitoring];
  return [home, ...sections.flatMap((section) => section.items), ...(user.role === "ADMIN" ? adminItems : [])];
}

const extraLabels: Record<string, string> = { "/students/import": "Cargar desde Excel" };
// Migas de pan: "Inicio › Estudiantes › Perfil".
export function breadcrumbsFor(pathname: string, items: NavItem[]): { to: string; label: string }[] {
  const root = items[0]!;
  const crumbs = [{ to: root.to, label: root.label }];
  if (pathname === "/") return crumbs;
  if (pathname.startsWith("/academic/")) crumbs.push({ to: "/academic", label: "Notas" });
  const exact = items.find((item) => item.to === pathname);
  if (exact) { crumbs.push({ to: exact.to, label: exact.label }); return crumbs; }
  const parent = items.filter((item) => item.to !== "/" && pathname.startsWith(`${item.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  if (parent) crumbs.push({ to: parent.to, label: parent.label });
  crumbs.push({ to: pathname, label: extraLabels[pathname] ?? (pathname.startsWith("/students/") ? "Perfil del estudiante" : "Página") });
  return crumbs;
}

export const shortcutList = [
  { keys: ["Ctrl", "K"], label: "Buscar estudiantes o ir a una sección" },
  { keys: ["/"], label: "Ir al buscador de la página" },
  { keys: ["Alt", "1…8"], label: "Ir a Inicio, Estudiantes, Notas, Horarios, Asistencia, Seguimiento, Análisis o Reportes" },
  { keys: ["Alt", "N"], label: "Registrar un estudiante nuevo" },
  { keys: ["Alt", "T"], label: "Cambiar tema claro u oscuro" },
  { keys: ["↑", "↓", "←", "→"], label: "Moverse entre las casillas de la planilla de notas" },
  { keys: ["Enter"], label: "Guardar la nota y bajar al siguiente estudiante" },
  { keys: ["Esc"], label: "Cerrar ventanas y menús" },
  { keys: ["?"], label: "Ver esta lista de atajos" },
];
