import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coffee, Pencil, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { ScheduleBreakDto, ScheduleDto } from "../services/api";
import { api } from "../services/api";
import { LoadingState } from "../components/Feedback";

const week = [{ n: 1, label: "Lun", long: "Lunes" }, { n: 2, label: "Mar", long: "Martes" }, { n: 3, label: "Mié", long: "Miércoles" }, { n: 4, label: "Jue", long: "Jueves" }, { n: 5, label: "Vie", long: "Viernes" }, { n: 6, label: "Sáb", long: "Sábado" }, { n: 7, label: "Dom", long: "Domingo" }];
const breakNames = ["Descanso", "Almuerzo", "Formación", "Dirección de grupo"];
const subjectTones = ["blue", "violet", "green", "amber", "teal", "pink", "coral"];
type ScheduleInput = { courseGroupId: string; subjectId: string; weekdays: number[]; startTime: string; endTime: string; toleranceMinutes: number };

function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return <div className="weekday-row">{week.map((day) => <label key={day.n} className={`weekday-chip ${days.includes(day.n) ? "selected" : ""}`}><input type="checkbox" checked={days.includes(day.n)} onChange={(e) => onChange(e.target.checked ? [...new Set([...days, day.n])].sort() : days.filter((v) => v !== day.n))} />{day.label}</label>)}</div>;
}

export function SchedulesPage() {
  const client = useQueryClient();
  const auth = useQuery({ queryKey: ["auth"], queryFn: api.getMe });
  const admin = auth.data?.user?.role === "ADMIN";
  const context = useQuery({ queryKey: ["attendanceContext"], queryFn: api.getAttendanceContext });
  const breaks = useQuery({ queryKey: ["scheduleBreaks"], queryFn: api.getScheduleBreaks });
  const [groupId, setGroupId] = useState("");
  const [editing, setEditing] = useState<ScheduleDto | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("08:00");
  const [tolerance, setTolerance] = useState("10");
  const [breakLabel, setBreakLabel] = useState("Descanso");
  const [breakDays, setBreakDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [breakStart, setBreakStart] = useState("09:00");
  const [breakEnd, setBreakEnd] = useState("09:30");
  const [breakForAll, setBreakForAll] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  useEffect(() => { if (!groupId && context.data?.groups.length) setGroupId(context.data.groups[0]!.id); }, [groupId, context.data]);
  const fail = (fallback: string) => (error: unknown) => setMessage({ tone: "error", text: error instanceof Error ? error.message : fallback });
  const resetClass = () => { setEditing(null); setSubjectId(""); setDays([1, 2, 3, 4, 5]); setStart(end); setEnd(addMinutes(end, 60)); setTolerance("10"); };
  const saveClass = useMutation({ mutationFn: ({ id, input }: { id?: string; input: ScheduleInput }) => id ? api.updateSchedule(id, input) : api.createSchedule(input), onSuccess: async () => { setMessage({ tone: "info", text: editing ? "Clase actualizada." : "Clase agregada al horario." }); resetClass(); await client.invalidateQueries({ queryKey: ["attendanceContext"] }); }, onError: fail("No se pudo guardar la clase.") });
  const removeClass = useMutation({ mutationFn: api.deactivateSchedule, onSuccess: async () => { setMessage({ tone: "info", text: "Clase quitada del horario. Las asistencias anteriores se conservan." }); await client.invalidateQueries({ queryKey: ["attendanceContext"] }); }, onError: fail("No se pudo quitar la clase.") });
  const addBreak = useMutation({ mutationFn: () => api.createScheduleBreak({ label: breakLabel.trim(), weekdays: breakDays, startTime: breakStart, endTime: breakEnd, ...(breakForAll ? {} : { courseGroupId: groupId }) }), onSuccess: async () => { setMessage({ tone: "info", text: `${breakLabel} agregado al horario.` }); await client.invalidateQueries({ queryKey: ["scheduleBreaks"] }); }, onError: fail("No se pudo agregar el descanso.") });
  const removeBreak = useMutation({ mutationFn: api.deleteScheduleBreak, onSuccess: async () => { await client.invalidateQueries({ queryKey: ["scheduleBreaks"] }); }, onError: fail("No se pudo quitar el descanso.") });

  if (context.isLoading) return <LoadingState label="Cargando horarios…" />;
  if (context.error || !context.data) return <section className="page"><p className="notice notice-error" role="alert">{context.error instanceof Error ? context.error.message : "No se pudo cargar el horario."}</p></section>;
  const groups = context.data.groups;
  const allSubjects = context.data.subjects;
  const subjects = allSubjects.filter((s) => s.courseGroupIds.includes(groupId));
  const classes = context.data.schedules.filter((s) => s.courseGroupId === groupId);
  const courseBreaks = (breaks.data?.items ?? []).filter((b) => !b.courseGroupId || b.courseGroupId === groupId);
  const subjectName = (id: string) => allSubjects.find((s) => s.id === id)?.name ?? "Materia";
  const subjectTone = (id: string) => subjectTones[Math.max(0, allSubjects.findIndex((s) => s.id === id)) % subjectTones.length];
  const beginEdit = (schedule: ScheduleDto) => { setEditing(schedule); setSubjectId(schedule.subjectId); setDays(schedule.weekdays); setStart(schedule.startTime); setEnd(schedule.endTime); setTolerance(String(schedule.toleranceMinutes)); setMessage(null); document.getElementById("class-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); };

  return <section className="page">
    <div className="page-heading"><div><h1>Horarios</h1><p className="page-subtitle">Arma el horario de cada curso: agrega las clases y los descansos. La tolerancia indica hasta cuántos minutos después del inicio cuenta como llegada a tiempo.</p></div></div>
    {message && <p className={`notice notice-${message.tone}`} role="status">{message.text}</p>}
    {!groups.length ? <p className="notice notice-info">Aún no hay cursos. Se crean al <Link to="/students/import">cargar estudiantes desde Excel</Link>.</p> : <>
      <div className="chip-filter" role="group" aria-label="Curso">{groups.map((g) => <button key={g.id} className={`filter-chip ${g.id === groupId ? "is-active" : ""}`} onClick={() => { setGroupId(g.id); setEditing(null); setSubjectId(""); }}>Curso {g.label.replace(" · ", " ")}</button>)}</div>

      <article className="content-card">
        <div className="card-title-row"><h2>Horario semanal</h2><span className="helper-text">Zona horaria: {context.data.timezone}</span></div>
        <Timetable classes={classes} breaks={courseBreaks} subjectName={subjectName} subjectTone={subjectTone} onEdit={beginEdit} />
      </article>

      <div className="feature-grid">
        <article className="content-card" id="class-form">
          <div className="card-title-row"><h2>{editing ? `Editar clase de ${subjectName(editing.subjectId)}` : "Agregar clase"}</h2>{editing && <button className="button button-ghost compact-button" onClick={resetClass}><X size={15} /> Cancelar</button>}</div>
          <form className="form-grid compact-form" onSubmit={(e) => { e.preventDefault(); saveClass.mutate({ id: editing?.id, input: { courseGroupId: groupId, subjectId, weekdays: days, startTime: start, endTime: end, toleranceMinutes: Number(tolerance) } }); }}>
            <label className="form-field form-full"><span>Asignatura</span><select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required><option value="">{subjects.length ? "Elige asignatura" : "Este curso no tiene asignaturas"}</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <div className="form-field form-full"><span>Días</span><DayPicker days={days} onChange={setDays} /></div>
            <label className="form-field"><span>Inicio</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
            <label className="form-field"><span>Fin</span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
            <label className="form-field"><span>Tolerancia (min)</span><input type="number" min="0" max="180" value={tolerance} onChange={(e) => setTolerance(e.target.value)} required /></label>
            <div className="form-field form-actions-end"><button className="button button-primary" disabled={saveClass.isPending || !days.length || !subjectId || end <= start}>{saveClass.isPending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar clase"}</button></div>
          </form>
          {classes.length > 0 && <ul className="mini-list">{classes.map((c) => <li key={c.id}><span className={`dot tone-${subjectTone(c.subjectId)}`} /><span className="mini-list-main"><strong>{subjectName(c.subjectId)}</strong> {c.weekdays.map((d) => week[d - 1]!.label).join(", ")} · {c.startTime}–{c.endTime}</span><button className="icon-only" onClick={() => beginEdit(c)} aria-label={`Editar ${subjectName(c.subjectId)}`} title="Editar clase"><Pencil size={15} /></button><button className="icon-only" onClick={() => { if (window.confirm("¿Quitar esta clase del horario? Las asistencias anteriores se conservan.")) removeClass.mutate(c.id); }} aria-label={`Quitar ${subjectName(c.subjectId)}`} title="Quitar clase"><Trash2 size={15} /></button></li>)}</ul>}
        </article>

        <article className="content-card">
          <div className="card-title-row"><h2>Agregar descanso</h2><Coffee size={18} className="muted" /></div>
          <form className="form-grid compact-form" onSubmit={(e) => { e.preventDefault(); addBreak.mutate(); }}>
            <label className="form-field form-full"><span>Nombre</span><input list="break-names" value={breakLabel} onChange={(e) => setBreakLabel(e.target.value)} maxLength={60} required /><datalist id="break-names">{breakNames.map((n) => <option key={n} value={n} />)}</datalist></label>
            <div className="form-field form-full"><span>Días</span><DayPicker days={breakDays} onChange={setBreakDays} /></div>
            <label className="form-field"><span>Inicio</span><input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} required /></label>
            <label className="form-field"><span>Fin</span><input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} required /></label>
            {admin && <label className="check-line form-full"><input type="checkbox" checked={breakForAll} onChange={(e) => setBreakForAll(e.target.checked)} /> Aplicar a todos los cursos</label>}
            <div className="form-full"><button className="button button-secondary" disabled={addBreak.isPending || !breakDays.length || !breakLabel.trim() || breakEnd <= breakStart}>{addBreak.isPending ? "Agregando…" : "Agregar descanso"}</button></div>
          </form>
          {courseBreaks.length > 0 && <ul className="mini-list">{courseBreaks.map((b) => <li key={b.id}><span className="dot dot-break" /><span className="mini-list-main"><strong>{b.label}</strong> {b.weekdays.map((d) => week[d - 1]!.label).join(", ")} · {b.startTime}–{b.endTime}{!b.courseGroupId && " · todos los cursos"}</span>{(admin || b.courseGroupId) && <button className="icon-only" onClick={() => removeBreak.mutate(b.id)} aria-label={`Quitar ${b.label}`} title="Quitar descanso"><Trash2 size={15} /></button>}</li>)}</ul>}
        </article>
      </div>
    </>}
  </section>;
}

function addMinutes(time: string, minutes: number) { const [h, m] = time.split(":").map(Number); const total = Math.min(23 * 60 + 59, h! * 60 + m! + minutes); return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }

function Timetable({ classes, breaks, subjectName, subjectTone, onEdit }: { classes: ScheduleDto[]; breaks: ScheduleBreakDto[]; subjectName: (id: string) => string; subjectTone: (id: string) => string | undefined; onEdit: (s: ScheduleDto) => void }) {
  if (!classes.length && !breaks.length) return <p className="empty-state">Este curso aún no tiene clases. Agrégalas abajo y aparecerán aquí.</p>;
  const usedDays = new Set([...classes, ...breaks].flatMap((x) => x.weekdays));
  const days = week.filter((d) => d.n <= 5 || usedDays.has(d.n));
  const slots = [...new Map([...classes, ...breaks].map((x) => [`${x.startTime}-${x.endTime}`, { start: x.startTime, end: x.endTime }])).values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return <div className="table-scroll"><table className="timetable">
    <thead><tr><th className="time-col">Hora</th>{days.map((d) => <th key={d.n}><span className="day-long">{d.long}</span><span className="day-short">{d.label}</span></th>)}</tr></thead>
    <tbody>{slots.map((slot) => {
      const inSlot = (x: { startTime: string; endTime: string }) => x.startTime === slot.start && x.endTime === slot.end;
      const slotClasses = classes.filter(inSlot);
      const slotBreaks = breaks.filter(inSlot);
      const fullBreak = !slotClasses.length && slotBreaks.find((b) => days.every((d) => b.weekdays.includes(d.n)));
      return <tr key={`${slot.start}-${slot.end}`} className={fullBreak ? "break-row" : ""}>
        <th className="time-col" scope="row">{slot.start}<small>{slot.end}</small></th>
        {fullBreak ? <td colSpan={days.length} className="break-cell"><Coffee size={15} aria-hidden="true" /> {fullBreak.label}</td>
          : days.map((d) => { const c = slotClasses.find((x) => x.weekdays.includes(d.n)); const b = !c && slotBreaks.find((x) => x.weekdays.includes(d.n));
            return <td key={d.n}>{c ? <button className={`class-cell tone-${subjectTone(c.subjectId)}`} onClick={() => onEdit(c)} title="Editar clase">{subjectName(c.subjectId)}</button> : b ? <span className="break-chip">{b.label}</span> : null}</td>; })}
      </tr>;
    })}</tbody>
  </table></div>;
}
