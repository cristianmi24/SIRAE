import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorPanel, LoadingState } from "../components/Feedback";
import { ACCOUNT_LIMITS } from "../../../shared/limits";
import { api, type PlatformLimitsInput, type PlatformOverviewDto } from "../services/api";

type Row = PlatformOverviewDto["institutions"][number];
const toNumber = (value: string): number | undefined => (value.trim() === "" ? undefined : Number(value));
const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export function PlatformInstitutionsPage() {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ["platformOverview"], queryFn: api.getPlatformOverview });
  const [name, setName] = useState("");
  const [type, setType] = useState<"INSTITUTION" | "PERSONAL">("INSTITUTION");
  const [adminEmail, setAdminEmail] = useState("");
  const [courses, setCourses] = useState(""); const [teachers, setTeachers] = useState(""); const [perTeacher, setPerTeacher] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["platformOverview"] });

  const create = useMutation({
    mutationFn: () => api.createPlatformInstitution({ name, type, adminEmail: adminEmail.trim() || undefined, limits: { courses: toNumber(courses), teachers: type === "INSTITUTION" ? toNumber(teachers) : undefined, coursesPerTeacher: type === "INSTITUTION" ? toNumber(perTeacher) : undefined } }),
    onSuccess: ({ item }) => {
      setNotice(item.adminStatus === "INVITED" ? `«${item.name}» creada. ${adminEmail.trim()} será administrador cuando se registre o inicie sesión con ese correo.` : item.adminStatus === "ASSIGNED" ? `«${item.name}» creada y ${adminEmail.trim()} ya es su administrador.` : `«${item.name}» creada.`);
      setName(""); setAdminEmail(""); setCourses(""); setTeachers(""); setPerTeacher(""); void refresh();
    },
    onError: (error) => setNotice(errorText(error, "No se pudo crear la institución.")),
  });

  if (overview.isLoading) return <LoadingState label="Cargando instituciones…" />;
  if (overview.error || !overview.data) return <div className="page"><ErrorPanel title="No se pudieron cargar las instituciones" detail={errorText(overview.error, "")} /></div>;
  const rows = overview.data.institutions;

  return <section className="page">
    <div className="page-heading"><div><h1>Instituciones</h1><p className="page-subtitle">Crea instituciones y reemplaza sus límites de capacidad. Lo que dejes vacío usa el valor por defecto.</p></div></div>
    <article className="content-card">
      <h2>Crear institución</h2>
      <form className="form-grid compact-form" onSubmit={(event) => { event.preventDefault(); setNotice(""); create.mutate(); }}>
        <label className="form-field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} /></label>
        <label className="form-field"><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="INSTITUTION">Institución (varios docentes)</option><option value="PERSONAL">Aula de docente</option></select></label>
        <label className="form-field form-full"><span>Correo del administrador (opcional)</span><input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} maxLength={254} placeholder="administrador@colegio.edu" /></label>
        <label className="form-field"><span>Máx. cursos</span><input type="number" min={1} max={100000} value={courses} onChange={(event) => setCourses(event.target.value)} placeholder={type === "INSTITUTION" ? "Por defecto: docentes × cursos por docente" : `Por defecto: ${ACCOUNT_LIMITS.PERSONAL.courses}`} /></label>
        {type === "INSTITUTION" && <>
          <label className="form-field"><span>Máx. docentes</span><input type="number" min={1} max={10000} value={teachers} onChange={(event) => setTeachers(event.target.value)} placeholder={`Por defecto: ${ACCOUNT_LIMITS.INSTITUTION.teachers}`} /></label>
          <label className="form-field"><span>Máx. cursos por docente</span><input type="number" min={1} max={1000} value={perTeacher} onChange={(event) => setPerTeacher(event.target.value)} placeholder={`Por defecto: ${ACCOUNT_LIMITS.INSTITUTION.coursesPerTeacher}`} /></label>
        </>}
        <div className="form-full"><button className="button button-primary" disabled={create.isPending || name.trim().length < 2}>{create.isPending ? "Creando…" : "Crear institución"}</button></div>
      </form>
      {notice && <p className="helper-text" role="status">{notice}</p>}
    </article>
    <article className="content-card">
      <h2>Instituciones y aulas ({rows.length})</h2>
      {rows.length ? <div className="stack">{rows.map((row) => <InstitutionRow key={row.id} row={row} onSaved={refresh} />)}</div> : <p className="empty-state">Todavía no hay instituciones.</p>}
    </article>
  </section>;
}

function InstitutionRow({ row, onSaved }: { row: Row; onSaved: () => unknown }) {
  const isInstitution = row.type === "INSTITUTION";
  const [courses, setCourses] = useState(String(row.limits.courses));
  const [teachers, setTeachers] = useState(String(row.limits.teachers ?? ""));
  const [perTeacher, setPerTeacher] = useState(String(row.limits.coursesPerTeacher ?? ""));
  const [message, setMessage] = useState("");
  const save = useMutation({
    mutationFn: (input: { limits?: PlatformLimitsInput; active?: boolean }) => api.updatePlatformInstitution(row.id, input),
    onSuccess: () => { setMessage("Guardado."); void onSaved(); },
    onError: (error) => setMessage(errorText(error, "No se pudo guardar.")),
  });
  const limits = (): PlatformLimitsInput => ({ courses: Number(courses), ...(isInstitution ? { teachers: Number(teachers), coursesPerTeacher: Number(perTeacher) } : {}) });
  const reset = () => save.mutate({ limits: { courses: null, ...(isInstitution ? { teachers: null, coursesPerTeacher: null } : {}) } });
  return <div className="inline-row" style={{ display: "grid", gap: ".6rem", padding: ".8rem 0", borderTop: "1px solid var(--line)" }}>
    <div><strong>{row.name}</strong> <span className={`course-tag ${isInstitution ? "tag-institution" : ""}`}>{isInstitution ? "Institución" : "Aula personal"}</span>{!row.active && <span className="course-tag"> Desactivada</span>}{row.customLimits && <span className="course-tag"> Límites personalizados</span>}
      <small className="cell-sub">{row.owner ? `${row.owner} · ` : ""}{row.members} docentes · {row.courses}/{row.limits.courses} cursos · {row.students} estudiantes</small></div>
    <div className="form-grid compact-form" style={{ gridTemplateColumns: isInstitution ? "repeat(3, minmax(0, 1fr))" : "minmax(0, 1fr)" }}>
      <label className="form-field"><span>Máx. cursos</span><input type="number" min={1} value={courses} onChange={(event) => setCourses(event.target.value)} /></label>
      {isInstitution && <>
        <label className="form-field"><span>Máx. docentes</span><input type="number" min={1} value={teachers} onChange={(event) => setTeachers(event.target.value)} /></label>
        <label className="form-field"><span>Cursos por docente</span><input type="number" min={1} value={perTeacher} onChange={(event) => setPerTeacher(event.target.value)} /></label>
      </>}
    </div>
    <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
      <button className="button button-primary" disabled={save.isPending} onClick={() => { setMessage(""); save.mutate({ limits: limits() }); }}>Guardar límites</button>
      <button className="button button-secondary" disabled={save.isPending || !row.customLimits} onClick={() => { setMessage(""); reset(); }}>Restablecer por defecto</button>
      <button className="button button-secondary" disabled={save.isPending} onClick={() => { setMessage(""); save.mutate({ active: !row.active }); }}>{row.active ? "Desactivar" : "Activar"}</button>
      {message && <span className="helper-text" role="status">{message}</span>}
    </div>
  </div>;
}
