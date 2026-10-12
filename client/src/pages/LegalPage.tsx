import { ArrowLeft, ArrowUp, Ban, Eye, FileLock2, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { ACCOUNT_LIMITS, ADMIN_CONTACT_EMAIL } from "../../../shared/limits";
import { Link } from "react-router-dom";
import { Byline } from "../components/Byline";

const UPDATED = "12 de octubre de 2026";
const sections = [
  { id: "terminos", label: "Términos de uso" },
  { id: "datos", label: "Qué datos usamos" },
  { id: "cuentas", label: "Docentes e instituciones" },
  { id: "estudiantes", label: "Consulta del estudiante" },
  { id: "asistencia", label: "Registro por código" },
  { id: "seguridad", label: "Seguridad" },
  { id: "responsabilidad", label: "Responsabilidad" },
  { id: "derechos", label: "Tus derechos" },
  { id: "cookies", label: "Cookies y almacenamiento" },
  { id: "quejas", label: "Quejas y solicitudes" },
];

// Términos, privacidad y seguridad en lenguaje sencillo. Página pública.
export function LegalPage() {
  return <main className="legal-page" id="top">
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
            <li>Al registrar estudiantes, en especial menores de edad, el docente o la institución declara que cuenta con la autorización de sus padres, madres o acudientes y de la institución. SIRAE asume que esa autorización existe desde el momento en que se ingresan los datos.</li>
            <li>Entrega a cada estudiante su código de forma personal. No publiques la lista completa de códigos.</li>
            <li>No uses SIRAE para fines distintos a la gestión académica ni intentes acceder a información de otras aulas.</li>
            <li>Los análisis y alertas describen los datos registrados; no reemplazan el criterio del docente. Que asistencia y rendimiento coincidan no demuestra que uno cause el otro.</li>
            <li>Al registrarte eliges el tipo de cuenta: <strong>Docente</strong> (cuenta individual, por defecto hasta {ACCOUNT_LIMITS.PERSONAL.courses} cursos) o <strong>Institución</strong> (por defecto hasta {ACCOUNT_LIMITS.INSTITUTION.teachers} docentes, con un máximo de {ACCOUNT_LIMITS.INSTITUTION.coursesPerTeacher} cursos cada uno). El administrador de la plataforma puede ampliar estos límites; para solicitarlo escribe a <a href={`mailto:${ADMIN_CONTACT_EMAIL}`}>{ADMIN_CONTACT_EMAIL}</a>.</li>
            <li>Podemos actualizar estos términos. Si el cambio es importante, lo avisaremos en el sitio.</li>
          </ul>
        </section>

        <section id="datos">
          <h2>2. Qué datos usamos y para qué</h2>
          <table className="legal-table">
            <thead><tr><th>Quién</th><th>Datos</th><th>Para qué</th></tr></thead>
            <tbody>
              <tr><td data-label="Quién">Docentes</td><td data-label="Datos">Nombre, correo, clave (guardada cifrada, nunca en texto) y tipo de cuenta.</td><td data-label="Para qué">Iniciar sesión y separar la información de cada aula.</td></tr>
              <tr><td data-label="Quién">Instituciones</td><td data-label="Datos">Nombre de la institución, quién la administra y qué docentes y cursos tiene asociados.</td><td data-label="Para qué">Gestionar a sus docentes y consultar la información de sus cursos.</td></tr>
              <tr><td data-label="Quién">Estudiantes</td><td data-label="Datos">Nombres, apellidos, código único, curso y asignaturas.</td><td data-label="Para qué">Identificarlos en la lista sin pedir documentos.</td></tr>
              <tr><td data-label="Quién">Asistencia</td><td data-label="Datos">Fecha, hora de registro y estado (a tiempo, tarde, ausente, justificada).</td><td data-label="Para qué">Llevar el control de asistencia y puntualidad.</td></tr>
              <tr><td data-label="Quién">Notas y seguimiento</td><td data-label="Datos">Calificaciones, actividades y observaciones del docente.</td><td data-label="Para qué">Calcular definitivas, informes y alertas.</td></tr>
            </tbody>
          </table>
          <p><strong>No recogemos:</strong> documento de identidad, teléfono ni correo de los estudiantes, fotografías, reconocimiento facial, huellas, ubicación ni direcciones IP para el registro de asistencia. Tampoco vendemos ni compartimos datos con terceros con fines comerciales.</p>
        </section>

        <section id="cuentas">
          <h2>3. Docentes e instituciones: quién ve qué</h2>
          <ul>
            <li><strong>Cuenta de docente:</strong> solo el docente ve y modifica sus cursos, estudiantes, asistencia y notas.</li>
            <li><strong>Cuenta de institución:</strong> quien la administra puede invitar docentes o crearles una cuenta con correo y clave, y ve a sus docentes, sus cursos y la asistencia de sus estudiantes. Esa información se actualiza sola mientras la página está abierta.</li>
            <li>Un docente de una institución solo ve los cursos que la institución le asignó. Una institución nunca ve docentes ni datos de otra institución.</li>
            <li>Si perteneces a tu propia aula y a una institución, puedes cambiar entre ellas; los datos de cada una se mantienen separados.</li>
          </ul>
        </section>

        <section id="estudiantes">
          <h2>4. Consulta del estudiante</h2>
          <ul>
            <li>En la pantalla de inicio, la opción <strong>Estudiante</strong> permite consultar el historial propio con el código único o escaneando el QR.</li>
            <li>Es <strong>solo de lectura</strong>: muestra asistencias (día, clase y hora de entrada) y notas. No permite editar, borrar ni ver datos de otros estudiantes.</li>
            <li>Cualquier persona que tenga el código de un estudiante podría ver ese historial; por eso el código debe guardarse como algo personal.</li>
            <li>Para evitar que alguien adivine códigos, tras varios intentos fallidos el dispositivo queda bloqueado por 15 minutos.</li>
          </ul>
        </section>

        <section id="asistencia">
          <h2>5. Registro de asistencia por código</h2>
          <ul>
            <li>El docente abre un enlace por un tiempo limitado (por ejemplo, 20 minutos). Al terminar, el enlace deja de funcionar.</li>
            <li>Cada código registra asistencia <strong>una sola vez</strong> por clase; después queda bloqueado para esa jornada.</li>
            <li>Cada dispositivo puede registrar <strong>un solo código</strong> por clase. Si intenta registrar otro, se bloquea y el docente recibe una alerta.</li>
            <li>Después de registrarse, la pantalla del estudiante queda abierta hasta que el docente termina la asistencia o se acaba el tiempo. Cada clase usa un enlace nuevo, así que el bloqueo no afecta otras clases.</li>
            <li>Los controles temporales del dispositivo se borran automáticamente pocas horas después de cerrar la jornada.</li>
            <li>El docente puede <strong>reabrir</strong> una clase cerrada. Los registros ya tomados se conservan, nadie queda registrado dos veces y el horario, la tolerancia y el tiempo del enlace no cambian.</li>
          </ul>
        </section>

        <section id="seguridad">
          <h2>6. Cómo protegemos la información</h2>
          <div className="legal-grid">
            <div><FileLock2 size={18} aria-hidden="true" /><p><strong>Claves cifradas.</strong> Las contraseñas se guardan con un algoritmo de cifrado de una vía (scrypt).</p></div>
            <div><ShieldCheck size={18} aria-hidden="true" /><p><strong>Sesiones privadas.</strong> La sesión usa una cookie protegida que el navegador no deja leer a otros scripts y vence a las 8 horas.</p></div>
            <div><KeyRound size={18} aria-hidden="true" /><p><strong>Aulas separadas.</strong> Cada docente o institución solo ve sus propios cursos y estudiantes; el servidor lo verifica en cada operación.</p></div>
            <div><Eye size={18} aria-hidden="true" /><p><strong>Trazabilidad.</strong> Los cambios importantes (notas, asistencia, borrados) quedan registrados en una auditoría.</p></div>
            <div><Smartphone size={18} aria-hidden="true" /><p><strong>QR opacos.</strong> El QR del estudiante no contiene su nombre ni sus notas; el sistema solo guarda una huella cifrada.</p></div>
            <div><Ban size={18} aria-hidden="true" /><p><strong>Límites de intentos.</strong> Se frenan los intentos repetidos de inicio de sesión y las solicitudes que no vienen de SIRAE o que traen datos manipulados.</p></div>
          </div>
          <p>Toda la comunicación viaja cifrada por HTTPS. Ningún sistema es 100% infalible: si detectas un problema de seguridad, escribe a <a href={`mailto:${ADMIN_CONTACT_EMAIL}`}>{ADMIN_CONTACT_EMAIL}</a>.</p>
        </section>

        <section id="responsabilidad">
          <h2>7. Responsabilidad sobre los datos ingresados</h2>
          <ul>
            <li>SIRAE es una herramienta: <strong>no decide qué datos se registran</strong>. Quien los ingresa (el docente o la institución) es responsable de que sean correctos, necesarios y de contar con la autorización para tratarlos.</li>
            <li>SIRAE no pide datos sensibles. <strong>No se hace responsable</strong> por datos sensibles u otra información que los usuarios ingresen por su cuenta en campos de texto libre (por ejemplo, observaciones o nombres de cursos), desde el momento en que se ingresan.</li>
            <li>Al ingresar datos de estudiantes se entiende que se cuenta con el permiso de sus padres, madres o acudientes. Si no existe ese permiso, ellos pueden pedir en cualquier momento que los datos se eliminen.</li>
          </ul>
        </section>

        <section id="derechos">
          <h2>8. Derechos sobre los datos</h2>
          <p>De acuerdo con la Ley 1581 de 2012 de protección de datos personales en Colombia, los titulares (y, en el caso de menores, sus padres o acudientes) pueden <strong>conocer, actualizar, corregir y pedir la eliminación</strong> de sus datos.</p>
          <ul>
            <li><strong>Eliminación de datos de un estudiante:</strong> el padre, madre o acudiente (o el estudiante, si es mayor de edad) puede pedir que se eliminen sus datos de SIRAE. La solicitud se hace en el <Link to="/quejas">formulario de quejas y solicitudes</Link> o directamente al docente o la institución, que pueden eliminar al estudiante desde SIRAE.</li>
            <li>Al eliminar un estudiante, un curso o "todo", se borran también su asistencia, notas y observaciones. Esta acción no se puede deshacer.</li>
            <li>Los docentes y las instituciones pueden pedir la eliminación de su cuenta al administrador de la plataforma: <a href={`mailto:${ADMIN_CONTACT_EMAIL}`}>{ADMIN_CONTACT_EMAIL}</a>.</li>
          </ul>
        </section>

        <section id="cookies">
          <h2>9. Cookies y almacenamiento en el navegador</h2>
          <p>SIRAE utiliza almacenamiento del navegador para mantener las sesiones de los docentes, generar un identificador aleatorio para el control del registro de asistencia y conservar preferencias locales, como el tema visual y los borradores de observaciones.</p>
          <table className="legal-table">
            <thead><tr><th>Qué se guarda</th><th>Para qué</th><th>Duración</th></tr></thead>
            <tbody>
              <tr><td data-label="Qué se guarda">Cookie de sesión (docentes e instituciones)</td><td data-label="Para qué">Mantener la sesión iniciada. Es una cookie protegida que los scripts de la página no pueden leer.</td><td data-label="Duración">8 horas o hasta cerrar sesión</td></tr>
              <tr><td data-label="Qué se guarda">Identificador del dispositivo</td><td data-label="Para qué">Un número aleatorio que genera SIRAE para el control del registro por código. No identifica a la persona.</td><td data-label="Duración">24 horas</td></tr>
              <tr><td data-label="Qué se guarda">Preferencias locales</td><td data-label="Para qué">El tema claro u oscuro y los borradores de observaciones. Se guardan solo en tu navegador.</td><td data-label="Duración">Hasta que las borres</td></tr>
              <tr><td data-label="Qué se guarda">Escaneos sin conexión</td><td data-label="Para qué">Si el docente escanea QR sin internet, el registro se guarda en el dispositivo y se envía al volver la conexión.</td><td data-label="Duración">Hasta que se envían</td></tr>
              <tr><td data-label="Qué se guarda">Cookies de analítica de Google Analytics (_ga y _ga_*)</td><td data-label="Para qué">Medir las visitas, distinguir visitantes y conocer cómo se usa el sitio. Las direcciones de las páginas se envían sin códigos de estudiantes, enlaces de asistencia ni identificadores.</td><td data-label="Duración">Hasta 2 años, según la configuración de Google</td></tr>
            </tbody>
          </table>
          <p>Si se encuentra habilitado Google Analytics, también se utilizan cookies propias de analítica para medir las visitas, distinguir visitantes y conocer cómo se utiliza el sitio web. Estos datos se emplean para elaborar estadísticas de uso y mejorar el servicio.</p>
          <p>SIRAE no utiliza cookies publicitarias de Google Ads, salvo que se incorporen y configuren expresamente dichos servicios. La información detallada sobre las tecnologías utilizadas y las opciones de privacidad se encuentra en esta política de privacidad del sistema.</p>
          <p>Puedes borrar las cookies y el almacenamiento desde la configuración de tu navegador. Si borras la cookie de sesión tendrás que volver a iniciar sesión.</p>
        </section>
        <section id="quejas">
          <h2>10. Quejas, reclamos y solicitudes</h2>
          <p>Cualquier persona puede enviar una queja, un reclamo o una solicitud (incluida la eliminación de datos) en el formulario de <Link to="/quejas">quejas y solicitudes</Link>. Cada envío recibe un número de radicado y llega directamente al administrador de la plataforma, que responde al correo indicado.</p>
        </section>
        <a className="legal-top" href="#top"><ArrowUp size={16} aria-hidden="true" /> Volver al inicio</a>
        <footer className="legal-footer"><Byline /><span>SIRAE · Sistema de Identificación y Registro de Asistencia Educativa</span></footer>
      </article>
    </div>
  </main>;
}
