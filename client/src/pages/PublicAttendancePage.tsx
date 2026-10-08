import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Clock3, Lock, LogOut } from "lucide-react";
import { api, type PublicLinkInfoDto } from "../services/api";
import { Byline } from "../components/Byline";

function useCountdown(target?: string, serverTime?: string) {
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => { if (serverTime) setOffset(new Date(serverTime).getTime() - Date.now()); }, [serverTime]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  if (!target) return "";
  const left = Math.max(0, new Date(target).getTime() - (now + offset));
  return `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
}

// Mientras la jornada sigue abierta, la pantalla queda fija: se avisa al cerrar la pestaña
// y el botón "atrás" no sale. Al cerrarse la jornada se libera sola.
function useScreenLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const stayHere = () => window.history.pushState(null, "", window.location.href);
    stayHere();
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", stayHere);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", stayHere); };
  }, [locked]);
}

export function PublicAttendancePage() {
  const { token = "" } = useParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [registeredBefore, setRegisteredBefore] = useState<PublicLinkInfoDto["registered"]>();
  const info = useQuery({ queryKey: ["publicLink", token], queryFn: () => api.getPublicLink(token), refetchInterval: 5000, retry: false });
  const data = info.data;
  const locked = data?.state === "ACTIVE" && Boolean(data.registered);
  useEffect(() => { if (data?.registered) setRegisteredBefore(data.registered); }, [data?.registered]);
  useScreenLock(locked);
  const countdown = useCountdown(data?.expiresAt, data?.serverTime);
  const register = useMutation({ mutationFn: () => api.registerWithCode(token, code), onSuccess: async () => { setError(""); setCode(""); await info.refetch(); }, onError: (e) => setError(e instanceof Error ? e.message : "No se pudo registrar.") });

  let body: React.ReactNode;
  if (info.isLoading) body = <p className="public-muted">Cargando…</p>;
  else if (info.error || !data) body = <div className="public-state"><h1>Enlace no válido</h1><p>Pídele a tu docente el enlace de la clase.</p></div>;
  else if (locked && data.registered) {
    const r = data.registered;
    body = <div className="public-profile" aria-live="polite">
      <span className="public-avatar" aria-hidden="true">{r.studentName.split(" ").map((p) => p.charAt(0)).slice(0, 2).join("")}</span>
      <h1>{r.studentName}</h1>
      <p className="public-muted">Curso {data.course} · {data.subject}</p>
      <div className={`public-status status-${r.status.toLowerCase()}`}><CheckCircle2 size={22} aria-hidden="true" /><div><strong>Asistencia registrada: {r.statusLabel}</strong>{r.time && <span>a las {r.time}</span>}</div></div>
      <div className="public-lock"><Lock size={18} aria-hidden="true" /><p>Esta pantalla queda abierta hasta que tu docente termine la asistencia o se acabe el tiempo{countdown && <> (quedan <strong>{countdown}</strong>)</>}. Luego podrás salir.</p></div>
    </div>;
  } else if (data.state !== "ACTIVE") {
    body = registeredBefore ? <div className="public-state released"><LogOut size={30} aria-hidden="true" /><h1>La asistencia terminó</h1><p>{registeredBefore.studentName}, tu registro quedó guardado como <strong>{registeredBefore.statusLabel}</strong>. Ya puedes salir de esta página.</p></div>
      : <div className="public-state"><Clock3 size={30} aria-hidden="true" /><h1>El registro está cerrado</h1><p>Esta clase no está recibiendo asistencia ahora. Si crees que es un error, habla con tu docente.</p></div>;
  } else {
    body = <form className="public-form" onSubmit={(e) => { e.preventDefault(); register.mutate(); }}>
      <p className="public-muted">Curso {data.course} · {data.subject}</p>
      <h1>Registra tu asistencia</h1>
      <label htmlFor="student-code">Escribe tu código</label>
      <input id="student-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABC123" aria-invalid={Boolean(error)} aria-describedby="code-help" autoFocus />
      {error ? <p className="public-error" role="alert" id="code-help">{error}</p> : <p className="public-muted" id="code-help">Es el código que te entregó tu docente. Solo puedes registrarte una vez.</p>}
      <button className="button button-primary button-wide" disabled={register.isPending || code.length < 3}>{register.isPending ? "Registrando…" : "Registrar asistencia"}</button>
      {countdown && <p className="public-countdown"><Clock3 size={15} aria-hidden="true" /> El registro cierra en {countdown}</p>}
    </form>;
  }

  return <main className="public-page">
    <header className="public-header"><img className="public-logo" src="/sirae-logo.webp" alt="SIRAE" width={150} height={98} />{data?.institution && <span>{data.institution}</span>}</header>
    <section className="public-card">{body}</section>
    <p className="public-foot">SIRAE no usa tu ubicación, tu cámara ni datos biométricos. <Link to="/legal#asistencia">Cómo funciona</Link></p>
    <Byline />
  </main>;
}
