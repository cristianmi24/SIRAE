import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { api, type AssessmentDto, type GradingMode, type PeriodDto } from "../services/api";
import { ErrorPanel, LoadingState } from "../components/Feedback";

const defaultBands = [
  { label: "Bajo", min: 0, max: 2.9 },
  { label: "Básico", min: 3, max: 3.9 },
  { label: "Alto", min: 4, max: 4.5 },
  { label: "Superior", min: 4.6, max: 5 },
];
const round = (value: number) => Math.round(value * 100) / 100;

export function GradesPage() {
  const client = useQueryClient();
  const auth = useQuery({ queryKey: ["auth"], queryFn: api.getMe });
  const admin = auth.data?.user?.role === "ADMIN";
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.getCourseGroups });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: api.getSubjects });
  const periods = useQuery({ queryKey: ["periods"], queryFn: api.getPeriods });
  const students = useQuery({ queryKey: ["students", "grade-list"], queryFn: () => api.getAllStudents("ACTIVO") });
  const [periodId, setPeriodId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const periodRows = useMemo(() => [...(periods.data?.items ?? [])].sort((a, b) => a.startsOn.localeCompare(b.startsOn)), [periods.data]);
  const courseRows = groups.data?.items ?? [];
  const subjectRows = (subjects.data?.items ?? []).filter((subject) => !courseId || subject.courseGroupIds?.includes(courseId));
  useEffect(() => { if (!periodId && periodRows.length) setPeriodId((periodRows.find((p) => p.active) ?? periodRows.at(-1))!.id); }, [periodId, periodRows]);
  useEffect(() => { if (!courseId && courseRows.length) setCourseId(courseRows[0]!.id); }, [courseId, courseRows]);
  useEffect(() => { if (subjectId && !subjectRows.some((s) => s.id === subjectId)) setSubjectId(""); }, [subjectId, subjectRows]);

  const fail = (fallback: string) => (error: unknown) => setNotice({ tone: "error", text: error instanceof Error ? error.message : fallback });
  if (groups.isLoading || subjects.isLoading || periods.isLoading) return <LoadingState label="Cargando notas…" />;
  const loadError = groups.error ?? subjects.error ?? periods.error;
  if (loadError) return <div className="page"><ErrorPanel title="No se pudieron cargar las notas" detail={loadError instanceof Error ? loadError.message : undefined} /></div>;
  const period = periodRows.find((p) => p.id === periodId);

  return <section className="page">
    <div className="page-heading"><div><h1>Notas</h1><p className="page-subtitle">Elige el periodo, el curso y la asignatura. Crea las notas que vas a calificar y decide si se promedian igual o con porcentajes.</p></div></div>
    {notice && <p className={`notice notice-${notice.tone}`} role="status">{notice.text}</p>}

    <div className="period-bar">
      <div className="segmented" role="tablist" aria-label="Periodos">
        {periodRows.map((p) => <button key={p.id} role="tab" aria-selected={p.id === periodId} className={p.id === periodId ? "is-active" : ""} onClick={() => setPeriodId(p.id)}>{p.name}</button>)}
      </div>
      {admin && <button className="button button-ghost compact-button" onClick={() => setShowPeriodForm((open) => !open)}><Plus size={15} /> Periodo</button>}
    </div>
    {(showPeriodForm || (!periodRows.length && admin)) && <PeriodForm onDone={(created) => { setShowPeriodForm(false); setPeriodId(created.id); setNotice({ tone: "info", text: `Periodo "${created.name}" creado.` }); void client.invalidateQueries({ queryKey: ["periods"] }); }} onError={fail("No se pudo crear el periodo.")} />}
    {!periodRows.length && !admin && <p className="notice notice-info">Aún no hay periodos. Pídele al administrador que cree el primero.</p>}

    {period && <article className="content-card">
      <div className="selector-row">
        <label className="form-field"><span>Curso</span><select value={courseId} onChange={(e) => setCourseId(e.target.value)}>{!courseRows.length && <option value="">Sin cursos</option>}{courseRows.map((g) => <option key={g.id} value={g.id}>Curso {g.grade} {g.group}</option>)}</select></label>
        <label className="form-field"><span>Asignatura</span><select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">{subjectRows.length ? "Elige asignatura" : "Sin asignaturas en este curso"}</option>{subjectRows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <p className="helper-text selector-hint">Escala {period.scale.min} a {period.scale.max}</p>
      </div>
      {!courseRows.length && <p className="notice notice-info">Los cursos y asignaturas se crean al <Link to="/students/import">cargar estudiantes desde Excel</Link>.</p>}
      {admin && courseId && <NewSubjectInline courseId={courseId} onCreated={(id) => { setSubjectId(id); void client.invalidateQueries({ queryKey: ["subjects"] }); }} onError={fail("No se pudo crear la asignatura.")} />}
    </article>}

    {period && courseId && subjectId && <Gradebook key={`${periodId}-${subjectId}-${courseId}`} period={period} subjectId={subjectId} students={(students.data?.items ?? []).filter((s) => s.courseGroup?.id === courseId).map((s) => ({ id: s.id, name: s.fullName }))} onNotice={setNotice} />}
  </section>;
}

function PeriodForm({ onDone, onError }: { onDone: (period: PeriodDto) => void; onError: (error: unknown) => void }) {
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("5");
  const create = useMutation({ mutationFn: () => { const lo = Number(min); const hi = Number(max); const fits = defaultBands.every((b) => b.min >= lo && b.max <= hi); return api.createPeriod({ name, startsOn, endsOn, min: lo, max: hi, bands: fits ? defaultBands : [{ label: "Escala", min: lo, max: hi }] }); }, onSuccess: ({ item }) => onDone(item), onError });
  return <form className="content-card inline-form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
    <label className="form-field"><span>Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Periodo 1" maxLength={80} required /></label>
    <label className="form-field"><span>Inicio</span><input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required /></label>
    <label className="form-field"><span>Fin</span><input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required /></label>
    <label className="form-field narrow-field"><span>Nota mín.</span><input type="number" step="any" value={min} onChange={(e) => setMin(e.target.value)} required /></label>
    <label className="form-field narrow-field"><span>Nota máx.</span><input type="number" step="any" value={max} onChange={(e) => setMax(e.target.value)} required /></label>
    <button className="button button-primary" disabled={create.isPending || Number(min) >= Number(max)}>{create.isPending ? "Creando…" : "Crear periodo"}</button>
  </form>;
}

function NewSubjectInline({ courseId, onCreated, onError }: { courseId: string; onCreated: (id: string) => void; onError: (error: unknown) => void }) {
  const [name, setName] = useState("");
  const create = useMutation({ mutationFn: () => api.createSubject({ name: name.trim(), courseGroupIds: [courseId] }), onSuccess: ({ item }) => { setName(""); onCreated(item.id); }, onError });
  return <details className="inline-details"><summary>¿Falta una asignatura?</summary><form className="inline-form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}><label className="form-field"><span>Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Matemáticas" maxLength={100} required /></label><button className="button button-secondary" disabled={create.isPending || !name.trim()}>Agregar a este curso</button></form></details>;
}

type CellState = "saving" | "saved" | "error";
function Gradebook({ period, subjectId, students, onNotice }: { period: PeriodDto; subjectId: string; students: { id: string; name: string }[]; onNotice: (n: { tone: "info" | "error"; text: string } | null) => void }) {
  const client = useQueryClient();
  const setup = useQuery({ queryKey: ["gradeSetup", period.id, subjectId], queryFn: () => api.getGradeSetup(period.id, subjectId) });
  const grades = useQuery({ queryKey: ["grades", period.id, subjectId], queryFn: () => api.getGrades({ periodId: period.id, subjectId }) });
  const [newName, setNewName] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const mode: GradingMode = setup.data?.categories[0]?.mode ?? "WEIGHTED";
  const assessments = setup.data?.assessments ?? [];
  const weighted = mode === "WEIGHTED";
  const totalWeight = round(assessments.reduce((sum, a) => sum + a.weightPercent, 0));
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ["gradeSetup", period.id, subjectId] }), client.invalidateQueries({ queryKey: ["analytics"] })]); };
  const fail = (fallback: string) => (error: unknown) => onNotice({ tone: "error", text: error instanceof Error ? error.message : fallback });

  const saved = useMemo(() => { const map = new Map<string, number>(); for (const g of grades.data?.items ?? []) map.set(`${g.studentId}|${g.assessment._id}`, g.value); return map; }, [grades.data]);
  const changeMode = useMutation({ mutationFn: (next: GradingMode) => api.setGradingMode({ periodId: period.id, subjectId, mode: next }), onSuccess: async () => { onNotice(null); await refresh(); }, onError: fail("No se pudo cambiar el cálculo.") });
  const addAssessment = useMutation({ mutationFn: () => api.createAssessment({ periodId: period.id, subjectId, name: newName.trim(), weightPercent: weighted ? Number(newWeight) : 0 }), onSuccess: async () => { setNewName(""); setNewWeight(""); onNotice(null); await refresh(); }, onError: fail("No se pudo agregar la nota.") });
  const updateWeight = useMutation({ mutationFn: ({ id, weightPercent }: { id: string; weightPercent: number }) => api.updateAssessment(id, { weightPercent }), onSuccess: refresh, onError: async (error) => { fail("No se pudo cambiar el porcentaje.")(error); await refresh(); } });
  const removeAssessment = useMutation({ mutationFn: api.deleteAssessment, onSuccess: async () => { await refresh(); await client.invalidateQueries({ queryKey: ["grades", period.id, subjectId] }); }, onError: fail("No se pudo quitar la nota.") });

  const saveCell = async (studentId: string, assessmentId: string) => {
    const key = `${studentId}|${assessmentId}`;
    const raw = drafts[key];
    if (raw === undefined || raw.trim() === "" || Number(raw) === saved.get(key)) return;
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value) || value < period.scale.min || value > period.scale.max) { setCells((c) => ({ ...c, [key]: "error" })); onNotice({ tone: "error", text: `La nota debe estar entre ${period.scale.min} y ${period.scale.max}.` }); return; }
    setCells((c) => ({ ...c, [key]: "saving" }));
    try {
      await api.saveGrade({ studentId, assessmentId, value });
      await client.invalidateQueries({ queryKey: ["grades", period.id, subjectId] });
      setDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
      setCells((c) => ({ ...c, [key]: "saved" }));
      void client.invalidateQueries({ queryKey: ["analytics"] });
    } catch (error) { setCells((c) => ({ ...c, [key]: "error" })); fail("No se pudo guardar la nota.")(error); }
  };
  const finalGrade = (studentId: string) => {
    let score = 0; let weight = 0;
    for (const a of assessments) { const v = saved.get(`${studentId}|${a.id}`); if (v === undefined) continue; const w = weighted ? a.weightPercent : 1; score += v * w; weight += w; }
    return weight ? round(score / weight) : undefined;
  };
  const band = (value?: number) => value === undefined ? undefined : period.scale.bands.find((b) => value >= b.min && value <= b.max)?.label;
  const moveFocus = (event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [event.shiftKey ? -1 : 1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const move = delta[event.key];
    if (!move) return;
    const input = event.currentTarget;
    // Izquierda/derecha solo saltan de casilla cuando el cursor está en el borde del texto.
    if (event.key === "ArrowLeft" && input.selectionStart !== 0) return;
    if (event.key === "ArrowRight" && input.selectionEnd !== input.value.length) return;
    const target = document.querySelector<HTMLInputElement>(`[data-cell="${row + move[0]}-${col + move[1]}"]`);
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.select();
  };

  if (setup.isLoading || grades.isLoading) return <LoadingState label="Cargando planilla…" />;
  return <>
    <article className="content-card">
      <div className="card-title-row">
        <div><h2>Notas del periodo</h2><p className="helper-text">¿Cómo se calcula la definitiva?</p></div>
        <div className="segmented" role="radiogroup" aria-label="Forma de calcular la definitiva">
          <button role="radio" aria-checked={!weighted} className={!weighted ? "is-active" : ""} disabled={changeMode.isPending} onClick={() => changeMode.mutate("AVERAGE")}>Promedio simple</button>
          <button role="radio" aria-checked={weighted} className={weighted ? "is-active" : ""} disabled={changeMode.isPending} onClick={() => changeMode.mutate("WEIGHTED")}>Por porcentajes</button>
        </div>
      </div>
      {assessments.length > 0 && <ul className="assessment-list">{assessments.map((a) => <AssessmentRow key={a.id} assessment={a} weighted={weighted} onWeight={(weightPercent) => updateWeight.mutate({ id: a.id, weightPercent })} onRemove={() => { if (window.confirm(`¿Quitar "${a.name}"? Se ocultarán sus calificaciones.`)) removeAssessment.mutate(a.id); }} />)}</ul>}
      {weighted && assessments.length > 0 && <p className={`weight-total ${totalWeight === 100 ? "is-ok" : ""}`}>Total: {totalWeight}%{totalWeight !== 100 && " · debe sumar 100%"}</p>}
      <form className="inline-form add-assessment" onSubmit={(e) => { e.preventDefault(); addAssessment.mutate(); }}>
        <label className="form-field"><span>Nueva nota</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`Ej. Quiz ${assessments.length + 1}`} maxLength={120} required /></label>
        {weighted && <label className="form-field narrow-field"><span>%</span><input type="number" min="0" max="100" step="0.1" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder={String(Math.max(0, round(100 - totalWeight)))} required /></label>}
        <button className="button button-primary" disabled={addAssessment.isPending || !newName.trim()}><Plus size={16} /> Agregar</button>
      </form>
    </article>

    <article className="content-card">
      <div className="card-title-row"><h2>Planilla</h2><span className="helper-text">Escribe la nota: se guarda sola. Muévete con las flechas o con Enter, como en Excel.</span></div>
      {!students.length ? <p className="empty-state">No hay estudiantes activos en este curso.</p> : !assessments.length ? <p className="empty-state">Agrega la primera nota para empezar a calificar.</p> :
        <div className="table-scroll"><table className="data-table gradebook">
          <thead><tr><th>Estudiante</th>{assessments.map((a) => <th key={a.id} className="num">{a.name}{weighted && <small>{a.weightPercent}%</small>}</th>)}<th className="num">Definitiva</th></tr></thead>
          <tbody>{students.map((s, rowIndex) => { const final = finalGrade(s.id); return <tr key={s.id}>
            <td className="student-cell"><Link className="student-name" to={`/students/${s.id}`}>{s.name}</Link></td>
            {assessments.map((a, colIndex) => { const key = `${s.id}|${a.id}`; const value = drafts[key] ?? (saved.has(key) ? String(saved.get(key)) : ""); return <td key={a.id} className="num"><input className={`grade-input ${cells[key] ? `is-${cells[key]}` : ""}`} inputMode="decimal" aria-label={`${a.name} de ${s.name}`} value={value} onChange={(e) => { setDrafts((d) => ({ ...d, [key]: e.target.value })); setCells((c) => { const next = { ...c }; delete next[key]; return next; }); }} onFocus={(e) => e.currentTarget.select()} onBlur={() => void saveCell(s.id, a.id)} onKeyDown={(e) => moveFocus(e, rowIndex, colIndex)} data-cell={`${rowIndex}-${colIndex}`} /></td>; })}
            <td className="num final-cell"><strong>{final ?? "—"}</strong>{band(final) && <small>{band(final)}</small>}</td>
          </tr>; })}</tbody>
        </table></div>}
    </article>
  </>;
}

function AssessmentRow({ assessment, weighted, onWeight, onRemove }: { assessment: AssessmentDto; weighted: boolean; onWeight: (value: number) => void; onRemove: () => void }) {
  const [weight, setWeight] = useState(String(assessment.weightPercent));
  useEffect(() => setWeight(String(assessment.weightPercent)), [assessment.weightPercent]);
  return <li>
    <span className="assessment-name">{assessment.name}</span>
    {weighted && <label className="weight-input"><input type="number" min="0" max="100" step="0.1" value={weight} aria-label={`Porcentaje de ${assessment.name}`} onChange={(e) => setWeight(e.target.value)} onBlur={() => { if (Number(weight) !== assessment.weightPercent && weight !== "") onWeight(Number(weight)); }} />%</label>}
    <button className="icon-only" onClick={onRemove} aria-label={`Quitar ${assessment.name}`} title="Quitar nota"><Trash2 size={15} /></button>
  </li>;
}
