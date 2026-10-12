import { Activity, BarChart3, Building2, BookOpenText, CalendarClock, FileBarChart2, Home, NotebookPen, QrCode, Settings2, ShieldCheck, TrendingUp, Users, type LucideIcon } from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; tone: string; step?: number; shortcut?: string };
export type NavSection = { title: string; items: NavItem[] };

// El orden sigue el flujo real: primero se cargan estudiantes (eso crea los cursos),
// luego materias y horarios, y después el trabajo diario y los resultados.
export const home: NavItem = { to: "/", label: "Inicio", icon: Home, tone: "sun", shortcut: "1" };
export const monitoring: NavItem = { to: "/", label: "Monitoreo", icon: Activity, tone: "teal", shortcut: "1" };
export const platformInstitutions: NavItem = { to: "/institutions", label: "Instituciones", icon: Building2, tone: "violet", shortcut: "2" };
export const platformAdminsItem: NavItem = { to: "/admins", label: "Administradores", icon: ShieldCheck, tone: "pink", shortcut: "3" };
export const platformWebStats: NavItem = { to: "/analytics", label: "Analytics", icon: TrendingUp, tone: "blue", shortcut: "4" };
export const platformTeachers: NavItem = { to: "/teachers", label: "Docentes", icon: Users, tone: "green", shortcut: "5" };
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

// Solo para el administrador de una cuenta de institución.
export const institutionItem: NavItem = { to: "/institution", label: "Institución", icon: Building2, tone: "teal" };
export const isInstitutionAdmin = (user: { role: string | null; accountType?: string }) => user.role === "ADMIN" && user.accountType === "INSTITUTION";
export function adminItemsFor(user: { role: string | null; accountType?: string }): NavItem[] {
  if (user.role !== "ADMIN") return [];
  return isInstitutionAdmin(user) ? [institutionItem, ...adminItems] : adminItems;
}

export function navItemsFor(user: { role: string | null; platformAdmin?: boolean; accountType?: string }): NavItem[] {
  if (user.platformAdmin) return [monitoring, platformInstitutions, platformAdminsItem, platformTeachers, platformWebStats];
  return [home, ...sections.flatMap((section) => section.items), ...adminItemsFor(user)];
}

const extraLabels: Record<string, string> = { "/analytics/en-vivo": "En vivo", "/analytics/usuarios": "Usuarios", "/analytics/sesiones": "Sesiones", "/analytics/paginas": "Páginas", "/analytics/audiencia": "Audiencia", "/students/import": "Cargar desde Excel" };
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
