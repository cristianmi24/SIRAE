import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, NotebookPen, QrCode, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { AuthUserDto } from "../../../shared/types";
import { ErrorPanel, LoadingState, Notice } from "../components/Feedback";
import { ApiClientError, api } from "../services/api";

export function DashboardPage({ user }: { user: AuthUserDto }) {
  const client = useQueryClient();
  const students = useQuery({ queryKey: ["students", "dashboard"], queryFn: () => api.getAllStudents("TODOS") });
  const groups = useQuery({ queryKey: ["courseGroups"], queryFn: api.getCourseGroups });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: api.getSubjects });
  const periods = useQuery({ queryKey: ["periods"], queryFn: api.getPeriods });
  const context = useQuery({ queryKey: ["attendanceContext"], queryFn: api.getAttendanceContext });
  const analytics = useQuery({ queryKey: ["analytics", "dashboard"], queryFn: () => api.getAnalytics({}) });
  const seed = useMutation({ mutationFn: api.seedDevelopmentData, onSuccess: async () => { await client.invalidateQueries(); } });
  if (students.isLoading || groups.isLoading || analytics.isLoading) return <LoadingState label="Preparando tu aula…" />;
  if (students.error || groups.error || analytics.error) {
    const error = students.error ?? groups.error ?? analytics.error;
    return <div className="page"><ErrorPanel title="No se pudo cargar el inicio" detail={error instanceof Error ? error.message : "Inténtalo de nuevo."} /></div>;
  }
  const total = students.data?.total ?? 0;
  const active = students.data?.items.filter((student) => student.status === "ACTIVO").length ?? 0;
  const courseCount = groups.data?.items.length ?? 0;
  const data = analytics.data!;
  const isAdmin = user.role === "ADMIN";
  const seedError = seed.error as ApiClientError | undefined;

  const steps = [
    { done: total > 0, title: "Carga tus estudiantes", text: courseCount ? `${active} estudiantes en ${courseCount} cursos` : "Sube tu lista de Excel; los cursos se crean solos", to: "/students/import", action: "Cargar lista", icon: Users, tone: "blue" },
    { done: Boolean(subjects.data?.items.length && periods.data?.items.length), title: "Crea materias y periodo", text: "Define qué enseñas y la escala de notas", to: "/academic", action: "Configurar", icon: NotebookPen, tone: "violet" },
    { done: Boolean(context.data?.schedules.length), title: "Define los horarios", text: "Días y horas de cada clase", to: "/academic/schedules", action: "Agregar horario", icon: CalendarClock, tone: "amber" },
    { done: data.totals.sessions > 0, title: "Toma asistencia", text: "Escanea los QR o marca a mano", to: "/attendance", action: "Tomar asistencia", icon: QrCode, tone: "green" },
  ];
  const nextStep = steps.findIndex((step) => !step.done);

  return <div className="page">
    <header className="welcome-banner">
      <div><h1>Hola, {user.name.split(" ")[0]}</h1><p>{nextStep === -1 ? "Tu aula está lista. Esto es lo más reciente." : `Siguiente paso: ${steps[nextStep]!.title.toLowerCase()}.`}</p></div>
      <Link to="/attendance" className="button button-sun"><QrCode size={18} /> Tomar asistencia</Link>
    </header>

    {nextStep !== -1 && <section className="content-card" aria-labelledby="steps-title">
      <div className="card-title-row"><h2 id="steps-title">Primeros pasos</h2><span className="helper-text">{steps.filter((step) => step.done).length} de {steps.length} listos</span></div>
      <ol className="checklist">{steps.map((step, index) => { const Icon = step.icon; return <li key={step.title} className={`checklist-item tone-${step.tone} ${step.done ? "is-done" : ""} ${index === nextStep ? "is-next" : ""}`}>
        <span className="checklist-icon">{step.done ? <Check size={18} /> : <Icon size={18} />}</span>
        <div><strong>{step.title}</strong><p>{step.text}</p></div>
        {!step.done && <Link className={`button ${index === nextStep ? "button-primary" : "button-ghost"} compact-button`} to={step.to}>{step.action}</Link>}
      </li>; })}</ol>
    </section>}

    <section className="metric-grid four-cols" aria-label="Resumen">
      <Metric tone="blue" label="Estudiantes activos" value={active} hint={`${courseCount} cursos`} />
      <Metric tone="green" label="Asistencia" value={`${data.totals.attendancePercent}%`} hint={`${data.totals.sessions} clases cerradas`} />
      <Metric tone="amber" label="Tardanzas" value={data.totals.late} hint={`Puntualidad ${data.totals.punctualityPercent}%`} />
      <Metric tone="coral" label="Ausencias" value={data.totals.absent} hint={`${data.totals.justified} justificadas`} />
    </section>

    <section className="content-card">
      <div className="card-title-row"><h2>Estudiantes para revisar</h2><Link className="button button-ghost compact-button" to="/analytics">Ver análisis</Link></div>
      {data.alerts.length ? <ul className="alert-list">{data.alerts.slice(0, 6).map((alert, index) => <li key={`${alert.studentId}-${alert.type}-${index}`}><span className={`alert-indicator alert-${alert.type.toLowerCase()}`} /><div><strong><Link className="student-name" to={`/students/${alert.studentId}`}>{alert.studentName}</Link></strong><p>{alert.message}</p></div></li>)}</ul>
        : <div className="empty-state"><Sparkles size={28} /><strong>Nadie necesita atención por ahora.</strong><p>Cuando cierres clases y registres notas, aquí aparecerán los estudiantes con baja asistencia o rendimiento.</p></div>}
    </section>

    {import.meta.env.DEV && isAdmin && total === 0 && <section className="content-card">
      <h2>Probar con datos de ejemplo</h2><p className="helper-text">Carga estudiantes, cursos, clases y notas ficticios para explorar la aplicación (solo en desarrollo).</p>
      <button className="button button-secondary" onClick={() => seed.mutate()} disabled={seed.isPending}>{seed.isPending ? "Cargando ejemplos…" : "Cargar datos de ejemplo"}</button>
      {seedError && <ErrorPanel title="No se pudieron cargar los ejemplos" detail={seedError.message} />}
      {seed.data && <Notice>Se crearon {seed.data.created} estudiantes y {seed.data.courseGroups} cursos de ejemplo.</Notice>}
    </section>}
  </div>;
}

function Metric({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone: string }) { return <article className={`metric-card tone-${tone}`}><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div></article>; }
