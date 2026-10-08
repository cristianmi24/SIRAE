import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { api } from "../../services/api";
import { useDialogBehavior } from "../../lib/ui-hooks";

// Confirmación fuerte: hay que escribir ELIMINAR para borrar todos los estudiantes y cursos.
export function DeleteEverythingDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const ref = useDialogBehavior(onClose);
  const [text, setText] = useState("");
  const remove = useMutation({ mutationFn: () => api.deleteEverything(text), onSuccess: (data) => onDone(`Se eliminaron ${data.deletedStudents} estudiantes y ${data.deletedCourses} cursos.`) });
  return <div className="dialog-backdrop" role="presentation">
    <section ref={ref} className="form-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-all-title">
      <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar" title="Cerrar (Esc)"><X size={20} /></button>
      <h2 id="delete-all-title">Eliminar todo</h2>
      <div className="notice notice-error"><AlertTriangle size={20} aria-hidden="true" /><div>Se borrarán <strong>todos los estudiantes y cursos</strong>, con sus asignaturas, horarios, clases, asistencia, notas y observaciones. Se conservan tu cuenta, los periodos y la configuración. No se puede deshacer.</div></div>
      <form onSubmit={(e) => { e.preventDefault(); remove.mutate(); }}>
        <label className="form-field delete-confirm"><span>Para confirmar, escribe <strong>ELIMINAR</strong></span><input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" aria-invalid={Boolean(remove.error)} /></label>
        {remove.error && <p className="form-error" role="alert">{remove.error instanceof Error ? remove.error.message : "No se pudo eliminar."}</p>}
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-danger" disabled={text !== "ELIMINAR" || remove.isPending}>{remove.isPending ? "Eliminando…" : "Eliminar todo"}</button></div>
      </form>
    </section>
  </div>;
}
