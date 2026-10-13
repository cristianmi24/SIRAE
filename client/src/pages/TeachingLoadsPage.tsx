import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Clock3, Trash2 } from "lucide-react";
import { LoadingState } from "../components/Feedback";
import { RequestError } from "../components/LimitNotice";
import { api, type TeachingLoadDto } from "../services/api";

const fmt = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });

// Intensidad horaria: por cada curso, qué docente dicta cada materia y cuántas horas semanales tiene.
// El horario usa estos datos para no programar más horas de las asignadas ni con otro docente.
export function TeachingLoadsPage() {
  const client = useQueryClient();
  const loads = useQuery({ queryKey: ["teachingLoads"], queryFn: api.getTeachingLoads });
  const groups = useQuery({ queryKey: ["courseGroups"], queryFn: api.getCourseGroups });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: api.getSubjects });
  const [courseId, setCourseId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [hours, setHours] = useState("3");
  const [classHour, setClassHour] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (!courseId && groups.data?.items.length) setCourseId(groups.data.items[0]!.id); }, [courseId, groups.data]);
  useEffect(() => { if (loads.data && !classHour) setClassHour(String(loads.data.classHourMinutes)); }, [loads.data, classHour]);
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["teachingLoads"] }), client.invalidateQueries({ queryKey: ["subjects"] }), client.invalidateQueries({ queryKey: ["attendanceContext"] }), client.invalidateQueries({ queryKey: ["institutionOverview"] })]);
  const done = (text: string) => async () => { setNotice(text); setError(null); await refresh(); };
  const fail = (failure: unknown) => { setError(failure); setNotice(""); };
  const save = useMutation({ mutationFn: api.saveTeachingLoad, onSuccess: async () => { await done("Asignación guardada.")(); setSubjectId(""); }, onError: fail });
  const remove = useMutation({ mutationFn: api.removeTeachingLoad, onSuccess: done("Asignación quitada. Las clases del horario se conservan."), onError: fail });
  const saveClassHour = useMutation({ mutationFn: (minutes: number) => api.setClassHour(minutes), onSuccess: done("Duración de la hora de clase guardada."), onError: fail });

  const course = groups.data?.items.find((group) => group.id === courseId);
  const courseLoads = useMemo(() => (loads.data?.items ?? []).filter((load) => load.courseGroupId === courseId), [loads.data, courseId]);
  const courseSubjects = useMemo(() => (subjects.data?.items ?? []).filter((subject) => subject.courseGroupIds?.includes(courseId) || (course && subject.grades?.includes(course.grade))), [subjects.data, courseId, course]);
  const freeSubjects = courseSubjects.filter((subject) => !courseLoads.some((load) => load.subjectId === subject.id));

  if (loads.isLoading || groups.isLoading || subjects.isLoading) return <LoadingState label="Cargando intensidad horaria…" />;
  const failure = loads.error ?? groups.error ?? subjects.error;
  if (failure || !loads.data) return <section className="page"><RequestError error={failure} fallback="No se pudo cargar la intensidad horaria." /></section>;
  const teachers = loads.data.teachers;
  const totalHours = courseLoads.reduce((sum, load) => sum + load.weeklyHours, 0);
  const totalScheduled = courseLoads.reduce((sum, load) => sum + load.scheduledHours, 0);

  return <section className="page">
    <div className="page-heading"><div><h1>Intensidad horaria</h1><p className="page-subtitle">Asigna en cada curso el docente de cada materia y sus horas semanales. Al armar el <Link to="/academic/schedules">horario</Link> no se podrán programar más horas de las asignadas ni con otro docente.</p></div></div>
    {notice && <p className="notice notice-success" role="status">{notice}</p>}
    {error ? <RequestError error={error} /> : null}

    <article className="content-card class-hour-card">
      <Clock3 size={20} aria-hidden="true" />
      <form className="class-hour-form" onSubmit={(event) => { event.preventDefault(); saveClassHour.mutate(Number(classHour)); }}>
        <label className="form-field"><span>Duración de una hora de clase (minutos)</span><input type="number" min={15} max={120} value={classHour} onChange={(event) => setClassHour(event.target.value)} required /></label>
        <button className="button button-secondary compact-button" disabled={saveClassHour.isPending || Number(classHour) === loads.data.classHourMinutes}>Guardar</button>
      </form>
      <p className="helper-text">Por ejemplo, si cada hora de clase dura 55 minutos, una materia de 4 horas suma 220 minutos a la semana.</p>
    </article>

    {!groups.data?.items.length ? <p className="notice notice-info">Aún no hay cursos. Créalos al <Link to="/students/import">cargar estudiantes</Link>.</p> : <>
      <div className="chip-filter" role="group" aria-label="Curso">{groups.data.items.map((group) => <button key={group.id} className={`filter-chip ${group.id === courseId ? "is-active" : ""}`} onClick={() => { setCourseId(group.id); setSubjectId(""); }}>Curso {group.label.replace(" · ", " ")}</button>)}</div>

      <article className="content-card">
        <div className="card-title-row"><h2>Curso {course?.label.replace(" · ", " ")}</h2><span className="helper-text">{fmt(totalScheduled)} de {fmt(totalHours)} h semanales en el horario</span></div>
        {courseLoads.length ? <div className="table-scroll"><table className="data-table load-table">
          <thead><tr><th>Materia</th><th>Docente</th><th>Horas semanales</th><th>En el horario</th><th aria-label="Acciones" /></tr></thead>
          <tbody>{courseLoads.map((load) => <LoadRow key={load.id} load={load} teachers={teachers} saving={save.isPending} onSave={(input) => save.mutate({ courseGroupId: load.courseGroupId, subjectId: load.subjectId, ...input })} onRemove={() => { if (window.confirm(`¿Quitar la asignación de ${load.subjectName}?`)) remove.mutate(load.id); }} />)}</tbody>
        </table></div> : <p className="empty-state">Este curso aún no tiene materias con intensidad horaria.</p>}

        <form className="form-grid compact-form load-form" onSubmit={(event) => { event.preventDefault(); save.mutate({ courseGroupId: courseId, subjectId, teacherUserId: teacherId, weeklyHours: Number(hours) }); }}>
          <h3 className="form-full">Agregar materia al curso</h3>
          <label className="form-field"><span>Materia</span><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">{freeSubjects.length ? "Elige la materia" : "No hay materias pendientes"}</option>{freeSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label className="form-field"><span>Docente</span><select value={teacherId} onChange={(event) => setTeacherId(event.target.value)} required><option value="">Elige el docente</option>{teachers.map((teacher) => <option key={teacher.userId} value={teacher.userId}>{teacher.name}{teacher.role === "ADMIN" ? " (administración)" : ""}</option>)}</select></label>
          <label className="form-field"><span>Horas semanales</span><input type="number" min={0.5} max={40} step={0.5} value={hours} onChange={(event) => setHours(event.target.value)} required /></label>
          <div className="form-field form-actions-end"><button className="button button-primary" disabled={save.isPending || !subjectId || !teacherId || !(Number(hours) > 0)}>Asignar</button></div>
          {!courseSubjects.length && <p className="helper-text form-full">Este curso no tiene materias. Créalas en <Link to="/subjects">Materias</Link>.</p>}
        </form>
      </article>
    </>}
  </section>;
}

function LoadRow({ load, teachers, saving, onSave, onRemove }: { load: TeachingLoadDto; teachers: { userId: string; name: string }[]; saving: boolean; onSave: (input: { teacherUserId: string; weeklyHours: number }) => void; onRemove: () => void }) {
  const [teacherId, setTeacherId] = useState(load.teacherUserId);
  const [hours, setHours] = useState(String(load.weeklyHours));
  useEffect(() => { setTeacherId(load.teacherUserId); setHours(String(load.weeklyHours)); }, [load.teacherUserId, load.weeklyHours]);
  const changed = teacherId !== load.teacherUserId || Number(hours) !== load.weeklyHours;
  const percent = load.weeklyHours ? Math.min(100, Math.round((load.scheduledHours / load.weeklyHours) * 100)) : 0;
  const complete = load.scheduledHours >= load.weeklyHours;
  return <tr>
    <td data-label="Materia"><strong>{load.subjectName}</strong></td>
    <td data-label="Docente"><select aria-label={`Docente de ${load.subjectName}`} value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>{teachers.map((teacher) => <option key={teacher.userId} value={teacher.userId}>{teacher.name}</option>)}</select></td>
    <td data-label="Horas semanales"><input aria-label={`Horas semanales de ${load.subjectName}`} className="hours-input" type="number" min={0.5} max={40} step={0.5} value={hours} onChange={(event) => setHours(event.target.value)} /></td>
    <td data-label="En el horario"><div className={`load-progress ${complete ? "is-complete" : ""}`}><span style={{ width: `${percent}%` }} /></div><small>{fmt(load.scheduledHours)} de {fmt(load.weeklyHours)} h{complete ? " · completo" : ` · faltan ${fmt(Math.max(0, load.weeklyHours - load.scheduledHours))} h`}</small></td>
    <td className="load-actions">{changed && <button className="button button-primary compact-button" disabled={saving || !(Number(hours) > 0)} onClick={() => onSave({ teacherUserId: teacherId, weeklyHours: Number(hours) })}>Guardar</button>}<button className="icon-only" onClick={onRemove} aria-label={`Quitar ${load.subjectName}`} title="Quitar"><Trash2 size={16} /></button></td>
  </tr>;
}
