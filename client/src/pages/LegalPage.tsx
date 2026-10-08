import { ArrowLeft, Ban, Eye, FileLock2, KeyRound, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Byline } from "../components/Byline";

const UPDATED = "8 de octubre de 2026";
const sections = [
  { id: "terminos", label: "Términos de uso" },
  { id: "datos", label: "Qué datos usamos" },
  { id: "estudiantes", label: "Consulta del estudiante" },
  { id: "asistencia", label: "Registro por código" },
  { id: "seguridad", label: "Seguridad" },
  { id: "derechos", label: "Tus derechos" },
  { id: "cookies", label: "Cookies y almacenamiento" },
];

// Términos, privacidad y seguridad en lenguaje sencillo. Página pública.
export function LegalPage() {
  return <main className="legal-page">
    <header className="legal-header">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> Volver a SIRAE</Link>
      <img src="/sirae-logo.webp" alt="SIRAE" width={120} height={78} />
    </header>
    <div className="legal-layout">
      <nav className="legal-toc" aria-label="Contenido"><p>Contenido</p><ol>{sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.label}</a></li>)}</ol></nav>
      <article className="legal-body">
        <h1>Términos, privacidad y seguridad</h1>
        <p className="legal-lead">SIRAE (Sistema de Identificación y Registro de Asistencia Educativa) ayuda a los docentes a tomar asistencia y registrar notas. Aquí explicamos, sin letra pequeña, qué datos usa, quién puede verlos y cómo se protegen.</p>
        <p className="legal-updated">Última actualización: {UPDATED}</p>

        <div className="legal-highlights">
          <div><Ban size={20} aria-hidden="true" /><strong>Sin datos sensibles</strong><span>No pedimos documento de identidad, teléfono, fotos, ubicación ni datos biométricos de los estudiantes.</span></div>
          <div><Eye size={20} aria-hidden="true" /><strong>Estudiantes: solo lectura</strong><span>Con su código o QR, el estudiante ve su asistencia y sus notas. No puede cambiar nada.</span></div>
          <div><KeyRound size={20} aria-hidden="true" /><strong>Solo el docente edita</strong><span>Notas y asistencia solo se modifican con la cuenta del docente, y cada cambio queda registrado.</span></div>
        </div>

        <section id="terminos">
          <h2>1. Términos de uso</h2>
          <ul>
            <li>SIRAE es una herramienta de apoyo para docentes e instituciones educativas. Al crear una cuenta aceptas estos términos.</li>
            <li>Cada docente es responsable de la información que registra: que los estudiantes, notas y asistencias sean correctos y que los use solo con fines educativos.</li>
            <li>Si registras a menores de edad, debes contar con la autorización de la institución y, cuando corresponda, de sus padres o acudientes.</li>
            <li>Entrega a cada estudiante su código de forma personal. No publiques la lista completa de códigos.</li>
            <li>No uses SIRAE para fines distintos a la gestión académica ni intentes acceder a información de otras aulas.</li>
            <li>Los análisis y alertas describen los datos registrados; no reemplazan el criterio del docente. Que asistencia y rendimiento coincidan no demuestra que uno cause el otro.</li>
            <li>Podemos actualizar estos términos. Si el cambio es importante, lo avisaremos en el sitio.</li>
          </ul>
        </section>

        <section id="datos">
          <h2>2. Qué datos usamos y para qué</h2>
          <table className="legal-table">
            <thead><tr><th>Quién</th><th>Datos</th><th>Para qué</th></tr></thead>
            <tbody>
              <tr><td>Docentes</td><td>Nombre, correo y clave (guardada cifrada, nunca en texto).</td><td>Iniciar sesión y separar la información de cada aula.</td></tr>
              <tr><td>Estudiantes</td><td>Nombres, apellidos, código único, curso y asignaturas.</td><td>Identificarlos en la lista sin pedir documentos.</td></tr>
              <tr><td>Asistencia</td><td>Fecha, hora de registro y estado (a tiempo, tarde, ausente, justificada).</td><td>Llevar el control de asistencia y puntualidad.</td></tr>
              <tr><td>Notas y seguimiento</td><td>Calificaciones, actividades y observaciones del docente.</td><td>Calcular definitivas, informes y alertas.</td></tr>
            </tbody>
          </table>
          <p><strong>No recogemos:</strong> documento de identidad, teléfono ni correo de los estudiantes, fotografías, reconocimiento facial, huellas, ubicación ni direcciones IP para el registro de asistencia. Tampoco vendemos ni compartimos datos con terceros con fines comerciales.</p>
        </section>

        <section id="estudiantes">
          <h2>3. Consulta del estudiante</h2>
          <ul>
            <li>En la pantalla de inicio, la opción <strong>Estudiante</strong> permite consultar el historial propio con el código único o escaneando el QR.</li>
            <li>Es <strong>solo de lectura</strong>: muestra asistencias (día, clase y hora de entrada) y notas. No permite editar, borrar ni ver datos de otros estudiantes.</li>
            <li>Cualquier persona que tenga el código de un estudiante podría ver ese historial; por eso el código debe guardarse como algo personal.</li>
            <li>Para evitar que alguien adivine códigos, tras varios intentos fallidos el dispositivo queda bloqueado por 15 minutos.</li>
          </ul>
        </section>

        <section id="asistencia">
          <h2>4. Registro de asistencia por código</h2>
          <ul>
            <li>El docente abre un enlace por un tiempo limitado (por ejemplo, 20 minutos). Al terminar, el enlace deja de funcionar.</li>
            <li>Cada código registra asistencia <strong>una sola vez</strong> por clase; después queda bloqueado para esa jornada.</li>
            <li>Cada dispositivo puede registrar <strong>un solo código</strong> por clase. Si intenta registrar otro, se bloquea y el docente recibe una alerta.</li>
            <li>Después de registrarse, la pantalla del estudiante queda abierta hasta que el docente termina la asistencia o se acaba el tiempo. Cada clase usa un enlace nuevo, así que el bloqueo no afecta otras clases.</li>
            <li>Los controles temporales del dispositivo se borran automáticamente pocas horas después de cerrar la jornada.</li>
          </ul>
        </section>

        <section id="seguridad">
          <h2>5. Cómo protegemos la información</h2>
          <div className="legal-grid">
            <div><FileLock2 size={18} aria-hidden="true" /><p><strong>Claves cifradas.</strong> Las contraseñas se guardan con un algoritmo de cifrado de una vía (scrypt).</p></div>
            <div><ShieldCheck size={18} aria-hidden="true" /><p><strong>Sesiones privadas.</strong> La sesión usa una cookie protegida que el navegador no deja leer a otros scripts y vence a las 8 horas.</p></div>
            <div><KeyRound size={18} aria-hidden="true" /><p><strong>Aulas separadas.</strong> Cada docente o institución solo ve sus propios cursos y estudiantes.</p></div>
            <div><Eye size={18} aria-hidden="true" /><p><strong>Trazabilidad.</strong> Los cambios importantes (notas, asistencia, borrados) quedan registrados en una auditoría.</p></div>
            <div><Smartphone size={18} aria-hidden="true" /><p><strong>QR opacos.</strong> El QR del estudiante no contiene su nombre ni sus notas; el sistema solo guarda una huella cifrada.</p></div>
            <div><Ban size={18} aria-hidden="true" /><p><strong>Límites de intentos.</strong> Se frenan los intentos repetidos y las solicitudes que no vienen de SIRAE.</p></div>
          </div>
          <p>Ningún sistema es 100% infalible. Si detectas un problema de seguridad, avísale al administrador de la plataforma.</p>
        </section>

        <section id="derechos">
          <h2>6. Derechos sobre los datos</h2>
          <p>De acuerdo con la Ley 1581 de 2012 de protección de datos personales en Colombia, los titulares (y, en el caso de menores, sus padres o acudientes) pueden <strong>conocer, actualizar, corregir y pedir la eliminación</strong> de sus datos.</p>
          <ul>
            <li>Para estudiantes: la solicitud se hace al docente o a la institución, que puede editar o eliminar al estudiante desde SIRAE.</li>
            <li>Al eliminar un estudiante, un curso o "todo", se borran también su asistencia, notas y observaciones. Esta acción no se puede deshacer.</li>
            <li>Los docentes pueden pedir la eliminación de su cuenta al administrador de la plataforma.</li>
          </ul>
        </section>

        <section id="cookies">
          <h2>7. Cookies y almacenamiento en el navegador</h2>
          <ul>
            <li><strong>Sesión</strong> (docentes): mantiene la sesión iniciada; vence a las 8 horas o al cerrar sesión.</li>
            <li><strong>Identificador del dispositivo</strong>: un número aleatorio que genera SIRAE para el control del registro por código. No identifica a la persona y vence en 24 horas.</li>
            <li><strong>Preferencias locales</strong>: el tema claro u oscuro y los borradores de observaciones se guardan solo en tu navegador.</li>
          </ul>
          <p>No usamos cookies de publicidad ni de rastreo.</p>
        </section>
        <footer className="legal-footer"><Byline /><span>SIRAE · Sistema de Identificación y Registro de Asistencia Educativa</span></footer>
      </article>
    </div>
  </main>;
}
