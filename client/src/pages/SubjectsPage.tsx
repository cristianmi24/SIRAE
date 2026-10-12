import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { GRADES, gradeLabel } from "../../../shared/courses";
import { LoadingState } from "../components/Feedback";
import { RequestError } from "../components/LimitNotice";
import { api } from "../services/api";

const PRIMARY = GRADES.filter((grade) => Number(grade) < 6);
const SECONDARY = GRADES.filter((grade) => Number(grade) >= 6);

// Materias del aula o de la institución, ordenadas por grado. Una materia puede dictarse en varios grados
// (por ejemplo, un docente que da clase en 8, 9 y 11 la marca en esos tres).
export function SubjectsPage() {
  const client = useQueryClient();
  const auth = useQuery({ queryKey: ["auth"], queryFn: api.getMe });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: api.getSubjects });
  const groups = useQuery({ queryKey: ["courseGroups"], queryFn: api.getCourseGroups });
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>(null);

  const isAdmin = auth.data?.user?.role === "ADMIN";
  // El administrador puede elegir cualquier grado; un docente de una institución, solo los de sus cursos.
  const available = useMemo(() => new Set(isAdmin ? GRADES : (groups.data?.items ?? []).map((group) => group.grade)), [isAdmin, groups.data]);
  const toggle = (grade: string) => setSelected((current) => (current.includes(grade) ? current.filter((value) => value !== grade) : [...current, grade]));
  const pick = (list: string[]) => setSelected((current) => { const usable = list.filter((grade) => available.has(grade)); const all = usable.every((grade) => current.includes(grade)); return all ? current.filter((grade) => !usable.includes(grade)) : [...new Set([...current, ...usable])]; });

  const create = useMutation({
    mutationFn: () => api.createSubject({ name: name.trim(), grades: [...selected].sort((a, b) => Number(a) - Number(b)) }),
    onSuccess: async ({ item }) => {
      setNotice(item.merged ? `«${item.name}» ya existía: se agregaron los grados elegidos.` : `«${item.name}» creada para ${selected.length === 1 ? "el grado" : "los grados"} ${[...selected].sort((a, b) => Number(a) - Number(b)).join(", ")}.`);
      setError(null); setName(""); setSelected([]);
      await Promise.all([client.invalidateQueries({ queryKey: ["subjects"] }), client.invalidateQueries({ queryKey: ["gradeSetup"] })]);
    },
    onError: (failure) => { setError(failure); setNotice(""); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deactivateSubject(id),
    onSuccess: async () => { setNotice("Materia quitada de la lista."); setError(null); await client.invalidateQueries({ queryKey: ["subjects"] }); },
    onError: (failure) => { setError(failure); setNotice(""); },
  });

  const byGrade = useMemo(() => {
    const text = search.trim().toLowerCase();
    const rows = (subjects.data?.items ?? []).filter((subject) => !text || subject.name.toLowerCase().includes(text));
    const map = new Map<string, typeof rows>();
    for (const subject of rows) for (const grade of subject.grades?.length ? subject.grades : ["—"]) map.set(grade, [...(map.get(grade) ?? []), subject]);
    return [...map.entries()].sort(([a], [b]) => (a === "—" ? 99 : Number(a)) - (b === "—" ? 99 : Number(b)));
  }, [subjects.data, search]);

  if (subjects.isLoading || groups.isLoading || auth.isLoading) return <LoadingState label="Cargando materias…" />;
  const total = subjects.data?.items.length ?? 0;
  return <section className="page">
    <div className="page-heading"><div><h1>Materias</h1><p className="page-subtitle">Crea las materias y elige en qué grados se dictan. Así quedan ordenadas por grado y cada docente encuentra las suyas para armar sus horarios y notas.</p></div></div>

    <article className="content-card">
      <h2>Nueva materia</h2>
      <form className="form-grid compact-form" onSubmit={(event) => { event.preventDefault(); setNotice(""); setError(null); create.mutate(); }}>
        <label className="form-field form-full"><span>Nombre de la materia</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="Ej. Matemáticas" /></label>
        <fieldset className="form-field form-full"><legend>Grados donde se dicta ({selected.length} elegidos)</legend>
          <div className="grade-picker">
            <div className="grade-row"><strong>Primaria</strong><button type="button" className="link-button" onClick={() => pick(PRIMARY)}>Todos</button>
              {PRIMARY.map((grade) => <button key={grade} type="button" className={`filter-chip ${selected.includes(grade) ? "is-active" : ""}`} aria-pressed={selected.includes(grade)} disabled={!available.has(grade)} onClick={() => toggle(grade)}>{grade}</button>)}</div>
            <div className="grade-row"><strong>Secundaria</strong><button type="button" className="link-button" onClick={() => pick(SECONDARY)}>Todos</button>
              {SECONDARY.map((grade) => <button key={grade} type="button" className={`filter-chip ${selected.includes(grade) ? "is-active" : ""}`} aria-pressed={selected.includes(grade)} disabled={!available.has(grade)} onClick={() => toggle(grade)}>{grade}</button>)}</div>
          </div>
          {!isAdmin && <p className="helper-text">Solo puedes elegir los grados donde tienes cursos asignados.</p>}
        </fieldset>
        <div className="form-full"><button className="button button-primary" disabled={create.isPending || name.trim().length < 2 || !selected.length}>{create.isPending ? "Guardando…" : "Crear materia"}</button></div>
      </form>
      {notice && <p className="helper-text" role="status">{notice}</p>}
      {error != null && <RequestError error={error} />}
    </article>

    <article className="content-card">
      <div className="card-title-row"><h2>Materias por grado ({total})</h2>
        <label className="search-field compact-search"><Search size={16} aria-hidden="true" /><input aria-label="Buscar materia" placeholder="Buscar materia" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      {byGrade.length ? <div className="subject-groups">{byGrade.map(([grade, rows]) => <details key={grade} open={byGrade.length <= 4 || Boolean(search.trim())}>
        <summary><strong>{grade === "—" ? "Sin grado asignado" : `Grado ${grade}`}</strong>{grade !== "—" && <span className="muted"> · {gradeLabel(grade)}</span>}<span className="muted"> · {rows.length} {rows.length === 1 ? "materia" : "materias"}</span></summary>
        <ul className="subject-chips">{rows.map((subject) => <li key={`${grade}-${subject.id}`} className="subject-chip">{subject.name}
          {isAdmin && <button type="button" aria-label={`Quitar ${subject.name}`} title="Quitar de la lista" onClick={() => { if (window.confirm(`¿Quitar «${subject.name}» de todos los grados? Las notas y la asistencia ya registradas se conservan.`)) remove.mutate(subject.id); }}><X size={13} aria-hidden="true" /></button>}</li>)}</ul>
      </details>)}</div> : <p className="empty-state">{total ? "Ninguna materia coincide con la búsqueda." : "Todavía no hay materias. Crea la primera arriba."}</p>}
    </article>
  </section>;
}
