import React, { Suspense } from "react";
import { lazyPage } from "../lib/lazy-page";
import { useQuery } from "@tanstack/react-query";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, GraduationCap, LockKeyhole, Moon, ShieldCheck, Sparkles, Sun, UsersRound } from "lucide-react";
import { StudentLookup } from "../features/auth/StudentLookup";
import { StudentSelfReport } from "../features/auth/StudentSelfReport";
import type { StudentSelfReportDto } from "../services/api";
import { useTheme } from "../lib/ui-hooks";
import { AppShell } from "../components/AppShell";
import { Byline } from "../components/Byline";
import { LoadingState } from "../components/Feedback";
import { BrandLoader } from "../components/Loading";
import { api, ApiClientError } from "../services/api";

const DashboardPage = lazyPage(() => import("../pages/DashboardPage").then((page) => ({ default: page.DashboardPage })));
const StudentProfilePage = lazyPage(() => import("../pages/StudentProfilePage").then((page) => ({ default: page.StudentProfilePage })));
const StudentsPage = lazyPage(() => import("../pages/StudentsPage").then((page) => ({ default: page.StudentsPage })));
const AttendancePage = lazyPage(() => import("../pages/AttendancePage").then((page) => ({ default: page.AttendancePage })));
const SchedulesPage = lazyPage(() => import("../pages/SchedulesPage").then((page) => ({ default: page.SchedulesPage })));
const GradesPage = lazyPage(() => import("../pages/GradesPage").then((page) => ({ default: page.GradesPage })));
const ObservationsPage = lazyPage(() => import("../pages/ObservationsPage").then((page) => ({ default: page.ObservationsPage })));
const ImportsPage = lazyPage(() => import("../pages/ImportsPage").then((page) => ({ default: page.ImportsPage })));
const AnalyticsPage = lazyPage(() => import("../pages/AnalyticsPage").then((page) => ({ default: page.AnalyticsPage })));
const ReportsPage = lazyPage(() => import("../pages/ReportsPage").then((page) => ({ default: page.ReportsPage })));
const SettingsPage = lazyPage(() => import("../pages/SettingsPage").then((page) => ({ default: page.SettingsPage })));
const StudentReportPage = lazyPage(() => import("../pages/StudentReportPage").then((page) => ({ default: page.StudentReportPage })));
const CourseGradesReportPage = lazyPage(() => import("../pages/CourseGradesReportPage").then((page) => ({ default: page.CourseGradesReportPage })));
const PublicAttendancePage = lazyPage(() => import("../pages/PublicAttendancePage").then((page) => ({ default: page.PublicAttendancePage })));
const StudentCodesPage = lazyPage(() => import("../pages/StudentCodesPage").then((page) => ({ default: page.StudentCodesPage })));
const LegalPage = lazyPage(() => import("../pages/LegalPage").then((page) => ({ default: page.LegalPage })));
const MonitoringPage = lazyPage(() => import("../pages/MonitoringPage").then((page) => ({ default: page.MonitoringPage })));
const NotFoundPage = lazyPage(() => import("../pages/NotFoundPage").then((page) => ({ default: page.NotFoundPage })));
const AuditPage = lazyPage(() => import("../pages/AuditPage").then((page) => ({ default: page.AuditPage })));

function Brand() {
  return <div className="brand brand-on-light"><img className="brand-logo" src="/sirae-logo.webp" alt="SIRAE" width={128} height={83} /><small className="brand-tagline">Sistema de Identificación y Registro<br />de Asistencia Educativa</small></div>;
}

function SignInScreen() {
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const { cycle: cycleTheme } = useTheme();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);
  const [audience, setAudience] = React.useState<"teacher" | "student">("teacher");
  const [selfReport, setSelfReport] = React.useState<{ report: StudentSelfReportDto; query: { code?: string; tokenHash?: string } } | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (mode === "login") await api.login({ email, password });
      else await api.register({ name, email, password, accountType: "PERSONAL" });
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible completar el acceso.");
    }
  };
  if (selfReport) return <StudentSelfReport report={selfReport.report} query={selfReport.query} onExit={() => setSelfReport(null)} />;
  return (
    <main className="marketing-page">
      <header className="marketing-header">
        <Brand />
        <nav className="marketing-nav" aria-label="Menú principal">
          <a href="#inicio">Inicio</a>
          <a href="#funciona">Cómo funciona</a>
          <a href="#seguridad">Seguridad</a>
        </nav>
        <div className="marketing-actions">
          <button type="button" className="topbar-button" onClick={cycleTheme} aria-label="Cambiar tema claro u oscuro" title="Tema claro/oscuro (Alt+T)"><Sun size={18} className="icon-light" /><Moon size={18} className="icon-dark" /></button>
          <button type="button" className="button button-secondary marketing-login" onClick={() => { setMode("login"); setAudience("teacher"); }}><LockKeyhole size={17} /> Iniciar sesión</button>
        </div>
      </header>

      <section id="inicio" className="marketing-hero">
        <div className="marketing-copy">
                    <h1>Asistencia y notas de tu aula, en un solo lugar.</h1>
          <p className="marketing-lead">Carga tu lista de estudiantes, toma asistencia con códigos QR y registra notas desde el celular o el computador.</p>
          <div className="marketing-proof"><span><CheckCircle2 size={17} /> Acceso protegido</span><span><CheckCircle2 size={17} /> QR sin datos personales</span></div>
        </div>
        <aside className="access-card" aria-label="Acceso y registro">
          <div className="segmented audience-tabs" role="tablist" aria-label="Tipo de acceso">
            <button role="tab" aria-selected={audience === "teacher"} className={audience === "teacher" ? "is-active" : ""} onClick={() => setAudience("teacher")}><LockKeyhole size={15} /> Docente</button>
            <button role="tab" aria-selected={audience === "student"} className={audience === "student" ? "is-active" : ""} onClick={() => setAudience("student")}><GraduationCap size={15} /> Estudiante</button>
          </div>
          {audience === "student" ? <>
            <h2>Consulta tu historial.</h2>
            <p>Escribe tu código o escanea tu QR para ver tus notas y asistencias hasta hoy.</p>
            <StudentLookup onReport={(report, query) => setSelfReport({ report, query })} />
          </> : <>
          <h2>{mode === "login" ? "Entra a tu aula." : "Crea tu aula."}</h2>
          <p>{mode === "login" ? "Accede con tu correo y clave." : "Cualquier persona puede crear un aula personal. Las instituciones las administra el administrador principal."}</p>
          <form className="compact-form" onSubmit={submit}>
            {mode === "register" && <label className="form-field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} /></label>}
            <label className="form-field"><span>Correo</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label className="form-field"><span>Clave</span><span className="password-field"><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ocultar clave" : "Mostrar clave"} aria-pressed={showPassword} title={showPassword ? "Ocultar clave" : "Mostrar clave"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            {mode === "register" && <p className="helper-text">Tu cuenta crea un aula personal con un máximo de 6 cursos. Las instituciones las gestiona el administrador.</p>}
            {mode === "register" && <label className="check-line terms-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required /> <span>Acepto los <Link to="/legal" target="_blank">términos, la política de privacidad y seguridad</Link>.</span></label>}
            {error && <p className="notice notice-error" role="alert">{error}</p>}
            <button className="button button-primary button-wide" disabled={mode === "register" && !accepted}><LockKeyhole size={18} /> {mode === "login" ? "Entrar" : "Registrarme"}</button>
          </form>
          <button type="button" className="register-link" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}</button>
          </>}
          <div className="access-security"><ShieldCheck size={17} aria-hidden="true" /> Claves protegidas y sesiones privadas. <Link to="/legal">Términos y privacidad</Link></div>
        </aside>
      </section>

      <section id="funciona" className="marketing-features" aria-label="Funciones de SIRAE">
        <article><UsersRound size={21} aria-hidden="true" /><h2>Estudiantes en orden</h2><p>Registra, filtra y consulta perfiles desde una sola vista institucional.</p></article>
        <article><Sparkles size={21} aria-hidden="true" /><h2>QR responsable</h2><p>Entrega códigos opacos, sin nombres ni notas dentro del QR.</p></article>
        <article id="seguridad"><ShieldCheck size={21} aria-hidden="true" /><h2>Privacidad primero</h2><p>Sin documentos ni datos biométricos de los estudiantes. Ellos solo pueden ver su historial, nunca editarlo. <Link to="/legal">Lee cómo protegemos los datos</Link>.</p></article>
      </section>

      <footer className="marketing-footer"><Brand /><Byline /><span>© {new Date().getFullYear()} SIRAE · Sistema de Identificación y Registro de Asistencia Educativa.</span><Link to="/legal">Términos, privacidad y seguridad</Link></footer>
    </main>
  );
}

function AuthenticatedApplication() {
  // Reintenta solo: en un arranque en frío o con red inestable el servidor puede tardar en responder.
  const auth = useQuery({
    queryKey: ["auth"], queryFn: api.getMe,
    retry: (count, error) => count < 4 && !(error instanceof ApiClientError && error.status < 500),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 6000),
    refetchInterval: (query) => query.state.data?.database === "unavailable" ? 3000 : false,
  });
  if (auth.isLoading) return <BrandLoader label="Verificando acceso seguro…" fullScreen />;
  if (auth.error || auth.data?.database === "unavailable") {
    return <main className="centered-page connection-screen">
      <BrandLoader label="Conectando con SIRAE…" fullScreen />
      <button className="button button-secondary" onClick={() => void auth.refetch()} disabled={auth.isFetching}>{auth.isFetching ? "Reintentando…" : "Reintentar ahora"}</button>
    </main>;
  }
  if (!auth.data?.authenticated || !auth.data.user) return <SignInScreen />;

  if (auth.data.user.platformAdmin) {
    return <AppShell user={auth.data.user}><Suspense fallback={<LoadingState label="Abriendo módulo…" />}><Routes><Route path="/" element={<MonitoringPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Suspense></AppShell>;
  }
  return (
    <AppShell user={auth.data.user}>
      <Suspense fallback={<LoadingState label="Abriendo módulo…" />}>
        <Routes>
          <Route path="/" element={<DashboardPage user={auth.data.user} />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/import" element={<ImportsPage />} />
          <Route path="/students/codes" element={<StudentCodesPage />} />
          <Route path="/students/:id" element={<StudentProfilePage />} />
          <Route path="/academic" element={<GradesPage />} />
          <Route path="/academic/schedules" element={<SchedulesPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/observations" element={<ObservationsPage />} />
          <Route path="/scan" element={<Navigate to="/attendance" replace />} />
          <Route path="/imports" element={<Navigate to="/students/import" replace />} />
          <Route path="/schedules" element={<Navigate to="/academic/schedules" replace />} />
          <Route path="/grades" element={<Navigate to="/academic" replace />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/students/:id" element={<StudentReportPage />} />
          <Route path="/reports/courses/:id" element={<CourseGradesReportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export function App() {
  // La página de registro por código es pública: el estudiante no inicia sesión.
  return <BrowserRouter><Routes>
    <Route path="/legal" element={<Suspense fallback={<LoadingState label="Cargando…" />}><LegalPage /></Suspense>} />
    <Route path="/asistencia/:token" element={<Suspense fallback={<LoadingState label="Cargando…" />}><PublicAttendancePage /></Suspense>} />
    <Route path="*" element={<AuthenticatedApplication />} />
  </Routes></BrowserRouter>;
}
