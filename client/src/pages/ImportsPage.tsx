import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileSpreadsheet, FolderPlus, Upload } from "lucide-react";
import { api, type ImportPreviewDto } from "../services/api";

const fields = [
  { key: "firstName", label: "Nombre", required: true }, { key: "lastName", label: "Apellido", required: true },
  { key: "grade", label: "Curso" }, { key: "group", label: "Grupo" }, { key: "subject", label: "Asignatura" }, { key: "document", label: "Código (opcional)" },
];

export function ImportsPage() {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [draftMapping, setDraftMapping] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const fail = (fallback: string) => (error: unknown) => setMessage({ tone: "error", text: error instanceof Error ? error.message : fallback });
  const upload = useMutation({ mutationFn: () => file ? api.previewImport(file) : Promise.reject(new Error("Elige un archivo primero.")), onSuccess: (data) => { setPreview(data); setDraftMapping(data.mapping); setMessage(null); }, onError: fail("No se pudo leer el archivo.") });
  const remap = useMutation({ mutationFn: () => api.remapImport(preview!.id, draftMapping), onSuccess: (data) => { setPreview(data); setDraftMapping(data.mapping); }, onError: fail("No se pudo revisar las columnas.") });
  const confirm = useMutation({ mutationFn: () => api.confirmImport(preview!.id), onSuccess: async (data) => { setMessage({ tone: "success", text: data.message }); setPreview(null); setDraftMapping({}); setFile(null); await Promise.all(["students", "courseGroups", "groups", "attendanceContext", "analytics"].map((key) => client.invalidateQueries({ queryKey: [key] }))); }, onError: fail("No se pudo cargar a los estudiantes.") });
  const mappingIsCurrent = Boolean(preview) && Object.keys({ ...preview?.mapping, ...draftMapping }).every((key) => preview?.mapping[key] === draftMapping[key]);
  const downloadTemplate = async (format: "csv" | "xlsx") => { try { await api.downloadImportTemplate(format); } catch (error) { fail("No se pudo descargar la plantilla.")(error); } };

  return <section className="page">
    <Link className="back-link" to="/students"><ArrowLeft size={16} /> Estudiantes</Link>
    <div className="page-heading"><div><h1>Cargar estudiantes desde Excel</h1><p className="page-subtitle">Sube tu lista y SIRAE crea solo los cursos y asignaturas que todavía no existan.</p></div></div>
    {message && <p className={`notice notice-${message.tone}`} role="status">{message.text}{message.tone === "success" && <> <Link to="/students">Ver estudiantes</Link></>}</p>}

    <ol className="steps-row">
      <li className="step-card tone-blue"><span className="step-number">1</span><div><h2>Descarga la plantilla</h2><p>Columnas: nombre, apellido, curso, grupo y asignatura. No se piden documentos ni datos de contacto.</p><div className="inline-actions"><button className="button button-secondary" onClick={() => void downloadTemplate("xlsx")}><FileSpreadsheet size={17} /> Excel</button><button className="button button-ghost" onClick={() => void downloadTemplate("csv")}>CSV</button></div></div></li>
      <li className="step-card tone-violet"><span className="step-number">2</span><div><h2>Llénala con tu lista</h2><p>Escribe el curso y el grupo de cada estudiante, por ejemplo <strong>8</strong> y <strong>A</strong>. Si el curso no existe, se crea. En <strong>asignatura</strong> puedes poner varias separadas por coma.</p></div></li>
      <li className="step-card tone-green"><span className="step-number">3</span><div><h2>Súbela y revisa</h2><label className="file-drop"><Upload size={20} aria-hidden="true" /><span>{file ? file.name : "Elegir archivo .xlsx o .csv"}</span><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setDraftMapping({}); }} /></label><button className="button button-primary" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? "Revisando…" : "Revisar archivo"}</button></div></li>
    </ol>

    {preview && <article className="content-card import-preview">
      <div className="card-title-row"><h2>Revisión antes de cargar</h2></div>
      <div className="summary-pills">
        <span className="pill pill-green">{preview.summary.valid} listos para cargar</span>
        {preview.summary.duplicates > 0 && <span className="pill pill-amber">{preview.summary.duplicates} ya existen</span>}
        {preview.summary.errors > 0 && <span className="pill pill-coral">{preview.summary.errors} filas con errores</span>}
        <span className="pill">{preview.summary.found} filas en el archivo</span>
      </div>
      {(preview.newCourses.length > 0 || preview.newSubjects.length > 0) && <div className="notice notice-info"><FolderPlus size={20} aria-hidden="true" /><div>{preview.newCourses.length > 0 && <p><strong>Cursos nuevos ({preview.newCourses.length}):</strong> {preview.newCourses.join(", ")}</p>}{preview.newSubjects.length > 0 && <p><strong>Asignaturas nuevas ({preview.newSubjects.length}):</strong> {preview.newSubjects.join(", ")}</p>}</div></div>}

      <details className="mapping-details">
        <summary>Revisar qué columna corresponde a cada dato</summary>
        <div className="import-mapping-grid">{fields.map((field) => <label className="form-field" key={field.key}><span>{field.label}{field.required ? " *" : ""}</span><select value={draftMapping[field.key] ?? ""} onChange={(event) => setDraftMapping((prior) => { const next = { ...prior }; if (event.target.value) next[field.key] = event.target.value; else delete next[field.key]; return next; })}><option value="">No usar</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
        {!mappingIsCurrent && <button className="button button-secondary" disabled={remap.isPending} onClick={() => remap.mutate()}>{remap.isPending ? "Revisando…" : "Aplicar columnas"}</button>}
      </details>

      <div className="table-scroll"><table className="data-table"><thead><tr>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{preview.preview.map((row, index) => <tr key={index}>{preview.headers.map((header) => <td key={header}>{row[header]}</td>)}</tr>)}</tbody></table></div>
      <p className="helper-text">Primeras {preview.preview.length} filas del archivo.</p>
      {preview.errors.length > 0 && <details className="error-details"><summary>Ver errores ({preview.errors.length})</summary><ul>{preview.errors.map((error, index) => <li key={`${error.row}-${error.field}-${index}`}>Fila {error.row}: {error.message}</li>)}</ul></details>}

      <div className="form-actions">
        <button className="button button-secondary" onClick={() => { setPreview(null); setDraftMapping({}); }}>Cancelar</button>
        <button className="button button-primary" disabled={confirm.isPending || remap.isPending || !mappingIsCurrent || preview.summary.valid === 0} onClick={() => confirm.mutate()}>{confirm.isPending ? "Cargando…" : `Cargar ${preview.summary.valid} estudiantes`}</button>
      </div>
    </article>}
  </section>;
}
