import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Send } from "lucide-react";
import { api, ApiClientError, type ComplaintInput, type ComplaintRole, type ComplaintType } from "../services/api";
import { complaintRoleLabel, complaintTypeLabel } from "../features/complaints/labels";
import { Byline } from "../components/Byline";

const empty = { type: "QUEJA" as ComplaintType, requesterRole: "PADRE_ACUDIENTE" as ComplaintRole, name: "", email: "", phone: "", institutionName: "", studentName: "", message: "", website: "" };

// Formulario público de quejas, reclamos y solicitudes (incluida la eliminación de datos).
// Llega al perfil del administrador de la plataforma.
export function ComplaintPage() {
  const [form, setForm] = useState(empty);
  const [consent, setConsent] = useState(false);
  const send = useMutation({ mutationFn: (input: ComplaintInput) => api.sendComplaint(input) });
  const set = (field: keyof typeof empty) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((prior) => ({ ...prior, [field]: event.target.value }));
  const details = send.error instanceof ApiClientError ? send.error.details : undefined;
  const isDeletion = form.type === "ELIMINACION_DATOS";

  return <main className="legal-page complaint-page" id="top">
    <header className="legal-header">
      <Link to="/legal" className="back-link"><ArrowLeft size={16} /> Términos y privacidad</Link>
      <img src="/sirae-logo.webp" alt="SIRAE" width={120} height={78} />
    </header>
    <article className="legal-body complaint-body">
      <h1>Quejas, reclamos y solicitudes</h1>
      <p className="legal-lead">Escríbenos si tienes una queja, un reclamo o quieres solicitar que se eliminen los datos de un estudiante. Tu mensaje llega directamente al administrador de SIRAE.</p>

      {send.isSuccess ? <div className="notice notice-success complaint-done" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <div><strong>Recibimos tu solicitud.</strong><p>Número de radicado: <span className="code-tag">{send.data.ticket}</span>. Guárdalo; te responderemos al correo que indicaste.</p>
          <button type="button" className="button button-secondary compact-button" onClick={() => { send.reset(); setForm(empty); setConsent(false); }}>Enviar otra solicitud</button></div>
      </div> : <form className="form-grid compact-form complaint-form" onSubmit={(event) => { event.preventDefault(); send.mutate({ ...form, phone: form.phone || undefined, institutionName: form.institutionName || undefined, studentName: form.studentName || undefined, website: form.website || undefined, consent: true }); }} noValidate={false}>
        <label className="form-field"><span>Tipo de solicitud</span><select value={form.type} onChange={set("type")}>{Object.entries(complaintTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="form-field"><span>Quién escribe</span><select value={form.requesterRole} onChange={set("requesterRole")}>{Object.entries(complaintRoleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {isDeletion && <p className="notice notice-info form-full">De acuerdo con la Ley 1581 de 2012, el padre, madre o acudiente (o el estudiante, si es mayor de edad) puede pedir que se eliminen sus datos. Indica el nombre del estudiante y la institución o docente para encontrarlo.</p>}
        <label className="form-field"><span>Nombre completo</span><input value={form.name} onChange={set("name")} required minLength={2} maxLength={120} autoComplete="name" />{details?.name && <small role="alert">{details.name}</small>}</label>
        <label className="form-field"><span>Correo para responderte</span><input type="email" value={form.email} onChange={set("email")} required maxLength={254} autoComplete="email" />{details?.email && <small role="alert">{details.email}</small>}</label>
        <label className="form-field"><span>Teléfono (opcional)</span><input type="tel" value={form.phone} onChange={set("phone")} maxLength={32} autoComplete="tel" /></label>
        <label className="form-field"><span>Institución o docente (opcional)</span><input value={form.institutionName} onChange={set("institutionName")} maxLength={160} /></label>
        <label className="form-field form-full"><span>Nombre del estudiante {isDeletion ? "" : "(opcional)"}</span><input value={form.studentName} onChange={set("studentName")} maxLength={160} required={isDeletion} /></label>
        <label className="form-field form-full"><span>Cuéntanos qué pasó</span><textarea value={form.message} onChange={set("message")} required minLength={10} maxLength={4000} rows={6} /><small>{form.message.length}/4000</small>{details?.message && <small role="alert">{details.message}</small>}</label>
        {/* Campo trampa para robots: oculto para las personas. */}
        <label className="complaint-trap" aria-hidden="true">Sitio web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} /></label>
        <label className="check-line form-full"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /> <span>Autorizo el uso de estos datos únicamente para atender mi solicitud, según la <Link to="/legal#derechos">política de privacidad</Link>.</span></label>
        {send.error && <p className="notice notice-error form-full" role="alert">{send.error instanceof Error ? send.error.message : "No se pudo enviar la solicitud."}</p>}
        <div className="form-full"><button className="button button-primary" disabled={send.isPending || !consent}><Send size={17} /> {send.isPending ? "Enviando…" : "Enviar solicitud"}</button></div>
      </form>}
      <footer className="legal-footer"><Byline /><Link to="/">Volver a SIRAE</Link></footer>
    </article>
  </main>;
}
