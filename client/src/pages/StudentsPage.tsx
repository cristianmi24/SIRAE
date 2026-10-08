import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, KeyRound, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import type { StudentDto } from "../../../shared/types";
import { ErrorPanel, LoadingState, QrDialog, StatusChip } from "../components/Feedback";
import { StudentForm } from "../features/students/StudentForm";
import { DeleteEverythingDialog } from "../features/students/DeleteEverythingDialog";
import { api, type QrDelivery } from "../services/api";

export function StudentsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ACTIVO" | "INACTIVO" | "TODOS">("ACTIVO");
  const [courseGroupId, setCourseGroupId] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const creating = searchParams.get("nuevo") === "1";
  const setCreating = (open: boolean) => setSearchParams(open ? { nuevo: "1" } : {}, { replace: true });
  const [editing, setEditing] = useState<StudentDto>();
  const [confirmAll, setConfirmAll] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [qr, setQr] = useState<{ student: StudentDto; result: QrDelivery }>();
  const auth = useQuery({ queryKey: ["auth"], queryFn: api.getMe });
  const owner = auth.data?.user?.role === "ADMIN";
  const groups = useQuery({ queryKey: ["courseGroups"], queryFn: api.getCourseGroups });
  const query = useMemo(() => {
    const params = new URLSearchParams({ status, pageSize: "100" });
    if (search.trim()) params.set("search", search.trim());
    if (courseGroupId) params.set("courseGroupId", courseGroupId);
    return `?${params.toString()}`;
  }, [search, status, courseGroupId]);
  const students = useQuery({ queryKey: ["students", query], queryFn: () => api.getStudents(query) });
  const courses = groups.data?.items ?? [];
  const selectedCourse = courses.find((c) => c.id === courseGroupId);
  const refreshAll = () => Promise.all(["students", "courseGroups", "groups", "attendanceContext", "analytics", "subjects"].map((key) => client.invalidateQueries({ queryKey: [key] })));
  const fail = (fallback: string) => (error: unknown) => setNotice({ tone: "error", text: error instanceof Error ? error.message : fallback });
  const removeStudent = useMutation({ mutationFn: api.deleteStudent, onSuccess: async () => { setNotice({ tone: "success", text: "Estudiante eliminado." }); await refreshAll(); }, onError: fail("No se pudo eliminar al estudiante.") });
  const removeCourse = useMutation({ mutationFn: api.deleteCourse, onSuccess: async (data) => { setCourseGroupId(""); setNotice({ tone: "success", text: `Curso eliminado junto con ${data.deletedStudents} estudiantes.` }); await refreshAll(); }, onError: fail("No se pudo eliminar el curso.") });
  const downloadQrs = async (format: "pdf" | "zip") => { try { await api.downloadStudentQrs(format); } catch (error) { fail("No fue posible descargar los códigos QR.")(error); } };

  return <div className="page">
    <header className="page-heading">
      <div><h1>Estudiantes</h1><p className="page-subtitle">Solo se registran nombres y apellidos. Cada estudiante recibe un código único para registrar su asistencia.</p></div>
      <div className="page-actions">
        <Link className="button button-secondary" to="/students/import"><FileSpreadsheet size={18} /> Cargar desde Excel</Link>
        <button className="button button-primary" onClick={() => setCreating(true)}><Plus size={18} /> Nuevo estudiante</button>
      </div>
    </header>
    {notice && <p className={`notice notice-${notice.tone}`} role="status">{notice.text}</p>}

    {courses.length > 0 && <div className="chip-filter" role="group" aria-label="Filtrar por curso">
      <button className={`filter-chip ${courseGroupId === "" ? "is-active" : ""}`} onClick={() => setCourseGroupId("")}>Todos los cursos</button>
      {courses.map((group) => <button key={group.id} className={`filter-chip ${courseGroupId === group.id ? "is-active" : ""}`} onClick={() => setCourseGroupId(group.id)}>Curso {group.grade} {group.group}</button>)}
    </div>}

    <section className="content-card">
      <div className="filter-bar">
        <label className="search-field"><Search size={18} aria-hidden="true" /><input data-search aria-label="Buscar estudiante" placeholder="Buscar por nombre o código (tecla /)" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="ACTIVO">Activos</option><option value="INACTIVO">Inactivos</option><option value="TODOS">Todos</option></select>
        <div className="filter-bar-end">
          <Link className="button button-ghost" to={`/students/codes${courseGroupId ? `?curso=${courseGroupId}` : ""}`}><KeyRound size={17} /> Imprimir códigos</Link>
          <button className="button button-ghost" onClick={() => void downloadQrs("pdf")}><Download size={17} /> QR en PDF</button>
        </div>
      </div>
      {students.isLoading ? <LoadingState label="Buscando estudiantes…" /> : students.error ? <ErrorPanel detail={students.error.message} /> : students.data?.items.length ? <div className="table-scroll"><table className="data-table">
        <thead><tr><th>Estudiante</th><th>Código</th><th>Curso</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
        <tbody>{students.data.items.map((student) => <tr key={student.id}>
          <td className="student-name-cell"><span className="mini-avatar" aria-hidden="true">{student.firstName.charAt(0)}{student.lastName.charAt(0)}</span><Link className="student-name" to={`/students/${student.id}`}>{student.fullName}</Link></td>
          <td><span className="code-tag">{student.document}</span></td>
          <td>{student.courseGroup ? <span className="course-tag">{student.courseGroup.label}</span> : <span className="muted">Sin curso</span>}</td>
          <td><StatusChip status={student.status} /></td>
          <td><div className="table-actions">
            <button className="icon-only icon-edit" onClick={() => setEditing(student)} aria-label={`Editar a ${student.fullName}`} title="Editar"><Pencil size={16} /></button>
            <button className="icon-only" disabled={removeStudent.isPending} onClick={() => { if (window.confirm(`¿Eliminar a ${student.fullName}? Se borrarán también su asistencia, notas y observaciones. No se puede deshacer.`)) removeStudent.mutate(student.id); }} aria-label={`Eliminar a ${student.fullName}`} title="Eliminar"><Trash2 size={16} /></button>
            <Link className="button button-ghost compact-button" to={`/students/${student.id}`}>Perfil</Link>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><Users size={36} aria-hidden="true" /><strong>{search || courseGroupId ? "No hay estudiantes que coincidan." : "Aún no tienes estudiantes."}</strong><p>{search || courseGroupId ? "Prueba con otro nombre, curso o estado." : "Empieza cargando tu lista desde Excel: los cursos se crearán solos."}</p>{!search && !courseGroupId && <Link className="button button-primary" to="/students/import"><FileSpreadsheet size={18} /> Cargar desde Excel</Link>}</div>}
    </section>

    {owner && courses.length > 0 && <section className="content-card danger-zone" aria-labelledby="danger-title">
      <div><h2 id="danger-title">Borrar datos</h2><p className="helper-text">Estas acciones son definitivas: también se borran la asistencia, las notas y las observaciones.</p></div>
      <div className="danger-actions">
        {selectedCourse ? <button className="button button-danger" disabled={removeCourse.isPending} onClick={() => { if (window.confirm(`¿Eliminar el curso ${selectedCourse.grade} ${selectedCourse.group} y todos sus estudiantes? No se puede deshacer.`)) removeCourse.mutate(selectedCourse.id); }}><Trash2 size={16} /> Eliminar curso {selectedCourse.grade} {selectedCourse.group}</button> : <span className="helper-text">Elige un curso arriba para poder eliminarlo.</span>}
        <button className="button button-danger" onClick={() => setConfirmAll(true)}><Trash2 size={16} /> Eliminar todo</button>
      </div>
    </section>}

    {creating && <StudentForm onClose={() => setCreating(false)} onSaved={(student, result) => { setCreating(false); if (result) setQr({ student, result }); }} />}
    {editing && <StudentForm student={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); setNotice({ tone: "success", text: "Cambios guardados." }); }} />}
    {confirmAll && <DeleteEverythingDialog onClose={() => setConfirmAll(false)} onDone={async (text) => { setConfirmAll(false); setCourseGroupId(""); setNotice({ tone: "success", text }); await refreshAll(); }} />}
    {qr && <QrDialog studentName={qr.student.fullName} code={qr.student.document} result={qr.result} onClose={() => setQr(undefined)} />}
  </div>;
}
