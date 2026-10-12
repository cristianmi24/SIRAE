import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, RefreshCw, UserPlus, UsersRound } from "lucide-react";
import { api, type InstitutionOverviewDto } from "../services/api";
import { LoadingState } from "../components/Feedback";
import { LimitNotice, PlanUsage, RequestError } from "../components/LimitNotice";

// La información se vuelve a consultar sola cada pocos segundos (y al volver a la pestaña),
// así la institución ve los mismos datos que registran sus docentes.
const LIVE_INTERVAL_MS = 10_000;
const statusLabel: Record<string, string> = { PRESENT: "A tiempo", LATE: "Tarde", ABSENT: "Ausente", JUSTIFIED: "Justificada", PENDING_REVIEW: "Por revisar" };
const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
const date = (iso?: string) => iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Nunca";

type Selection = { membershipId: string; courseId: string };

export function InstitutionPage() {
  const overview = useQuery({ queryKey: ["institutionOverview"], queryFn: api.getInstitutionOverview, refetchInterval: LIVE_INTERVAL_MS, refetchIntervalInBackground: false });
  const [selection, setSelection] = useState<Selection | null>(null);
  if (overview.isLoading) return <LoadingState label="Cargando la institución…" />;
  if (overview.error || !overview.data) return <section className="page"><RequestError error={overview.error} fallback="No se pudo cargar la información de la institución." /></section>;
  const data = overview.data;
  const teacherLimit = data.plan.limits.teachers ?? 0;
  const teachersFull = (data.plan.usage.teachers ?? 0) >= teacherLimit;
  const selectedTeacher = selection ? data.teachers.find((teacher) => teacher.membershipId === selection.membershipId) : undefined;
  const selectedCourse = selectedTeacher?.courses.find((course) => course.id === selection?.courseId);

  return <section className="page">
    <div className="page-heading">
      <div><h1><Building2 size={24} aria-hidden="true" /> {data.institution.name}</h1><p className="page-subtitle">Docentes asociados a la institución, sus cursos y la asistencia de sus estudiantes.</p></div>
      <div className="heading-actions"><Link className={`button button-primary ${teachersFull ? "is-disabled" : ""}`} to="/settings#docentes" aria-disabled={teachersFull} onClick={(event) => { if (teachersFull) event.preventDefault(); }}><UserPlus size={17} /> Invitar docente</Link></div>
    </div>
    <PlanUsage />
    <p className="live-status" aria-live="polite"><span className={`live-dot ${overview.isFetching ? "is-fetching" : ""}`} aria-hidden="true" /> Actualizado a las {time(data.generatedAt)} · se actualiza cada {LIVE_INTERVAL_MS / 1000} s <button type="button" className="link-button" onClick={() => void overview.refetch()} disabled={overview.isFetching}><RefreshCw size={14} /> Actualizar</button></p>
    {teachersFull && <LimitNotice title="La institución tiene el máximo de docentes" message={`Ya hay ${data.plan.usage.teachers} de ${teacherLimit} docentes asociados (incluye invitaciones pendientes).`} />}

    {data.teachers.length === 0 ? <article className="content-card empty-card"><UsersRound size={28} aria-hidden="true" /><h2>Aún no hay docentes asociados</h2><p className="helper-text">Invita a tus docentes desde <Link to="/settings#docentes">Configuración</Link> y asígnales sus cursos. Cuando se registren o inicien sesión con ese correo, aparecerán aquí.</p></article>
      : <div className="teacher-grid">{data.teachers.map((teacher) => <article key={teacher.membershipId} className="content-card teacher-card">
        <header><span className="avatar" aria-hidden="true">{teacher.name.charAt(0).toUpperCase()}</span><div><h2>{teacher.name}</h2><small>{teacher.email ?? "Sin correo visible"} · último ingreso: {date(teacher.lastSeenAt)}</small></div></header>
        <p className="helper-text">{teacher.courses.length}/{data.plan.limits.coursesPerTeacher} cursos · {teacher.students} estudiantes activos</p>
        <ul className="teacher-courses">{teacher.courses.map((course) => {
          const active = selection?.membershipId === teacher.membershipId && selection.courseId === course.id;
          return <li key={course.id}><button type="button" className={`teacher-course ${active ? "is-active" : ""}`} aria-pressed={active} onClick={() => setSelection(active ? null : { membershipId: teacher.membershipId, courseId: course.id })}>
            <strong>Curso {course.label}</strong>
            <span>{course.students} estudiantes · {course.sessions} clases</span>
            {course.lastSession && <span className="course-last">Última clase {course.lastSession.dateKey} · <em className={course.lastSession.state === "OPEN" ? "is-open" : ""}>{course.lastSession.state === "OPEN" ? "abierta" : "cerrada"}</em> · {course.lastSession.summary.present} a tiempo, {course.lastSession.summary.late} tarde, {course.lastSession.summary.absent} ausentes</span>}
          </button></li>;
        })}{!teacher.courses.length && <li className="helper-text">Sin cursos asignados.</li>}</ul>
      </article>)}</div>}

    {selection && selectedTeacher && selectedCourse && <CourseStudents key={`${selection.membershipId}:${selection.courseId}`} selection={selection} teacherName={selectedTeacher.name} courseLabel={selectedCourse.label} />}

    <div className="feature-grid two-cols">
      <article className="content-card"><h2>Cursos sin docente</h2>{data.unassignedCourses.length ? <ul className="simple-list">{data.unassignedCourses.map((course) => course && <li key={course.id}>Curso {course.label} · {course.students} estudiantes</li>)}</ul> : <p className="helper-text">Todos los cursos tienen docente asignado.</p>}</article>
      <article className="content-card"><h2>Invitaciones pendientes</h2>{data.pendingInvitations.length ? <ul className="simple-list">{data.pendingInvitations.map((invitation) => <li key={invitation.id}>{invitation.email} · {invitation.role === "DOCENTE" ? `Docente, ${invitation.courseGroupIds.length} cursos` : "Administrador"}</li>)}</ul> : <p className="helper-text">No hay invitaciones pendientes.</p>}<AdminsLine admins={data.admins} /></article>
    </div>
  </section>;
}

function AdminsLine({ admins }: { admins: InstitutionOverviewDto["admins"] }) {
  if (!admins.length) return null;
  return <p className="helper-text">Administran la institución: {admins.map((admin) => admin.name).join(", ")}.</p>;
}

function CourseStudents({ selection, teacherName, courseLabel }: { selection: Selection; teacherName: string; courseLabel: string }) {
  const students = useQuery({ queryKey: ["institutionCourseStudents", selection.membershipId, selection.courseId], queryFn: () => api.getInstitutionCourseStudents(selection.membershipId, selection.courseId), refetchInterval: LIVE_INTERVAL_MS });
  const data = students.data;
  return <article className="content-card">
    <div className="card-title-row"><div><h2>Curso {courseLabel} · {teacherName}</h2><p className="helper-text">{data ? `${data.students.length} estudiantes · ${data.totalSessions} clases registradas${data.lastSession ? ` · última clase ${data.lastSession.dateKey} (${data.lastSession.state === "OPEN" ? "abierta" : "cerrada"})` : ""} · actualizado ${time(data.generatedAt)}` : "Cargando…"}</p></div></div>
    {students.isLoading ? <LoadingState label="Cargando estudiantes…" /> : students.error ? <RequestError error={students.error} /> : <div className="table-scroll"><table className="data-table">
      <thead><tr><th>Estudiante</th><th>Código</th><th>A tiempo</th><th>Tarde</th><th>Ausente</th><th>Justificada</th><th>Asistencia</th><th>Última clase</th></tr></thead>
      <tbody>{(data?.students ?? []).map((student) => <tr key={student.id}>
        <td>{student.name}</td><td><span className="code-tag">{student.code}</span></td><td>{student.present}</td><td>{student.late}</td><td>{student.absent}</td><td>{student.justified}</td>
        <td>{student.attendancePercent === undefined ? "—" : `${student.attendancePercent}%`}</td>
        <td>{student.lastStatus ? `${statusLabel[student.lastStatus] ?? student.lastStatus}${student.lastRecordedAt ? ` · ${time(student.lastRecordedAt)}` : ""}` : "Sin registro"}</td>
      </tr>)}{!data?.students.length && <tr><td colSpan={8}>Este curso no tiene estudiantes activos.</td></tr>}</tbody>
    </table></div>}
  </article>;
}
