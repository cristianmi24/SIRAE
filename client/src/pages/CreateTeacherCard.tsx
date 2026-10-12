import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { GRADES, GROUPS } from "../../../shared/courses";
import { api } from "../services/api";
import { RequestError } from "../components/LimitNotice";

// El administrador de la institución crea la cuenta del docente con correo y contraseña,
// le marca sus cursos y el docente entra de inmediato (sin invitaciones ni correos).
export function CreateTeacherCard({ maxCourses, disabled }: { maxCourses: number; disabled: boolean }) {
  const client = useQueryClient();
  const groups = useQuery({ queryKey: ["courseGroups"], queryFn: api.getCourseGroups });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [grade, setGrade] = useState("");
  const [group, setGroup] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>(null);
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["institutionOverview"] }), client.invalidateQueries({ queryKey: ["plan"] }), client.invalidateQueries({ queryKey: ["courseGroups"] }), client.invalidateQueries({ queryKey: ["memberships"] })]);

  const createCourse = useMutation({
    mutationFn: () => api.createCourseGroup({ grade: grade.trim(), group: group.trim(), academicYear: new Date().getFullYear() }),
    onSuccess: async ({ item }) => { setGrade(""); setGroup(""); setError(null); setSelected((current) => (current.length < maxCourses ? [...current, item.id] : current)); await refresh(); },
    onError: (failure) => { setError(failure); setNotice(""); },
  });
  const create = useMutation({
    mutationFn: () => api.createTeacherAccount({ name, email, password, courseGroupIds: selected }),
    onSuccess: async (result) => { setNotice(result.message); setError(null); setName(""); setEmail(""); setPassword(""); setSelected([]); await refresh(); },
    onError: (failure) => { setError(failure); setNotice(""); },
  });

  const toggle = (id: string, checked: boolean) => setSelected(checked ? [...selected, id].slice(0, maxCourses) : selected.filter((value) => value !== id));
  const ready = name.trim().length >= 2 && email.trim() && password.length >= 8 && selected.length > 0;
  return <article className="content-card" id="crear-docente">
    <h2><UserPlus size={18} aria-hidden="true" /> Crear cuenta de docente</h2>
    <p className="helper-text">Escribe el correo y una contraseña, marca sus cursos y listo: el docente entra de inmediato con esos datos. Comparte la contraseña directamente con la persona. Cada docente puede tener hasta {maxCourses} cursos.</p>
    <form className="form-grid compact-form" onSubmit={(event) => { event.preventDefault(); setNotice(""); setError(null); create.mutate(); }}>
      <label className="form-field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={160} autoComplete="off" /></label>
      <label className="form-field"><span>Correo</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="off" /></label>
      <label className="form-field form-full"><span>Contraseña (mínimo 8 caracteres)</span><input type="text" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={200} autoComplete="new-password" /></label>
      <fieldset className="form-field form-full"><legend>Cursos del docente ({selected.length}/{maxCourses})</legend>
        {(groups.data?.items.length ?? 0) > 8 && <input className="checkbox-search" type="search" placeholder="Buscar curso…" aria-label="Buscar curso" value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} />}
        <div className="checkbox-list">{(groups.data?.items ?? []).filter((item) => !courseSearch.trim() || `${item.label} ${item.academicYear}`.toLowerCase().includes(courseSearch.trim().toLowerCase()) || selected.includes(item.id)).map((item) => { const checked = selected.includes(item.id); return <label key={item.id}><input type="checkbox" checked={checked} disabled={!checked && selected.length >= maxCourses} onChange={(event) => toggle(item.id, event.target.checked)} />{item.label} · {item.academicYear}</label>; })}
          {!groups.data?.items.length && <span className="helper-text">Todavía no hay cursos. Crea uno aquí abajo.</span>}</div>
      </fieldset>
      <div className="form-full" style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "end" }}>
        <label className="form-field" style={{ flex: "1 1 120px" }}><span>Nuevo curso: grado</span><select value={grade} onChange={(event) => setGrade(event.target.value)}><option value="">Grado</option>{GRADES.map((value) => <option key={value} value={value}>{value}{Number(value) >= 6 ? " · Secundaria" : " · Primaria"}</option>)}</select></label>
        <label className="form-field" style={{ flex: "1 1 120px" }}><span>Grupo</span><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">Grupo</option>{GROUPS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <button type="button" className="button button-secondary" disabled={createCourse.isPending || !grade.trim() || !group.trim()} onClick={() => createCourse.mutate()}>{createCourse.isPending ? "Creando…" : "Crear curso"}</button>
      </div>
      <div className="form-full"><button className="button button-primary" disabled={create.isPending || disabled || !ready}>{create.isPending ? "Creando…" : "Crear docente"}</button></div>
    </form>
    {notice && <p className="helper-text" role="status">{notice}</p>}
    {error != null && <RequestError error={error} />}
  </article>;
}
