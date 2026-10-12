import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Mail, TriangleAlert } from "lucide-react";
import { ADMIN_CONTACT_EMAIL, accountTypeLabel, capacityRequestMailto } from "../../../shared/limits";
import { api, ApiClientError } from "../services/api";

export const isLimitError = (error: unknown): error is ApiClientError => error instanceof ApiClientError && error.code === "PLAN_LIMIT_REACHED";

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* sin permiso o sin https */ }
  // Respaldo para navegadores sin API de portapapeles.
  const field = document.createElement("textarea");
  field.value = text; field.setAttribute("readonly", ""); field.style.position = "fixed"; field.style.opacity = "0";
  document.body.append(field); field.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  field.remove();
  return ok;
}

// Aviso cuando la cuenta llega a su capacidad: indica a quién escribir, permite copiar el correo
// y abre el cliente de correo del dispositivo con la solicitud ya redactada.
export function LimitNotice({ message, title = "Llegaste al límite de tu cuenta" }: { message?: string; title?: string }) {
  const auth = useQuery({ queryKey: ["auth"], queryFn: api.getMe, staleTime: 60_000 });
  const user = auth.data?.user;
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const email = ADMIN_CONTACT_EMAIL;
  const body = [
    "Hola, quiero solicitar una ampliación de capacidad en SIRAE.",
    "",
    `Nombre: ${user?.name ?? ""}`,
    `Correo de la cuenta: ${user?.email ?? ""}`,
    `Tipo de cuenta: ${user?.accountType ? accountTypeLabel(user.accountType) : ""}`,
    `Aula o institución: ${user?.institution?.name ?? ""}`,
    "",
    `Motivo: ${message ?? "Necesito más capacidad."}`,
    "Capacidad que necesito: ",
  ].join("\n");
  const copy = async () => { setCopied((await copyText(email)) ? "ok" : "error"); window.setTimeout(() => setCopied(null), 2500); };
  return <div className="notice notice-warning limit-notice" role="alert">
    <TriangleAlert size={20} aria-hidden="true" />
    <div>
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      <p>Para ampliar la capacidad, contacta al administrador en <a href={capacityRequestMailto("Solicitud de ampliación de capacidad - SIRAE", body)} className="limit-email">{email}</a>.</p>
      <div className="limit-actions">
        <button type="button" className="button button-secondary compact-button" onClick={() => void copy()}>{copied === "ok" ? <Check size={16} /> : <Copy size={16} />} {copied === "ok" ? "Correo copiado" : "Copiar correo"}</button>
        <a className="button button-primary compact-button" href={capacityRequestMailto("Solicitud de ampliación de capacidad - SIRAE", body)}><Mail size={16} /> Escribir solicitud</a>
      </div>
      {copied === "error" && <small>No se pudo copiar automáticamente. Selecciona el correo y cópialo: {email}</small>}
    </div>
  </div>;
}

// Muestra el error de una solicitud: si es por límite de capacidad, con el contacto del administrador.
export function RequestError({ error, fallback = "No fue posible completar la solicitud." }: { error: unknown; fallback?: string }) {
  if (!error) return null;
  if (isLimitError(error)) return <LimitNotice message={error.message.split(" Para ampliar la capacidad")[0]} />;
  return <p className="notice notice-error" role="alert">{error instanceof Error ? error.message : fallback}</p>;
}

// Uso actual frente al límite de la cuenta.
export function PlanUsage({ compact = false }: { compact?: boolean }) {
  const plan = useQuery({ queryKey: ["plan"], queryFn: api.getPlan, staleTime: 15_000 });
  const item = plan.data?.item;
  if (!item) return null;
  const rows = [{ label: "Cursos", used: item.usage.courses, limit: item.limits.courses }];
  if (item.accountType === "INSTITUTION" && item.limits.teachers !== undefined) rows.push({ label: "Docentes", used: item.usage.teachers ?? 0, limit: item.limits.teachers });
  if (item.usage.ownCourses !== undefined && item.limits.coursesPerTeacher !== undefined) rows.push({ label: "Mis cursos", used: item.usage.ownCourses, limit: item.limits.coursesPerTeacher });
  return <div className={`plan-usage ${compact ? "is-compact" : ""}`} aria-label={`Capacidad de la cuenta de ${accountTypeLabel(item.accountType)}`}>
    <span className="plan-type">Cuenta de {accountTypeLabel(item.accountType).toLowerCase()}</span>
    {rows.map((row) => <span key={row.label} className={`plan-meter ${row.used >= row.limit ? "is-full" : ""}`}><strong>{row.used}/{row.limit}</strong> {row.label.toLowerCase()}</span>)}
    {item.accountType === "INSTITUTION" && !compact && <span className="plan-meter">máx. {item.limits.coursesPerTeacher} cursos por docente</span>}
  </div>;
}
