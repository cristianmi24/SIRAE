<p align="center">
  <img src="public/sirae-logo.webp" alt="SIRAE" width="260" />
</p>

<h1 align="center">SIRAE</h1>
<p align="center"><strong>Sistema de Identificación y Registro de Asistencia Educativa</strong></p>
<p align="center">Asistencia por código, QR o a mano, notas por periodo y reportes, desde el celular o el computador.</p>

---

## ¿Qué es?

SIRAE es una aplicación web para docentes. Permite cargar estudiantes desde Excel, tomar asistencia en segundos, registrar notas y generar informes. Fue pensada para el aula: es simple, funciona en el celular y no pide datos sensibles de los estudiantes.

- **Sin documentos de identidad:** de cada estudiante solo se guardan nombres y apellidos. El sistema le asigna un **código único** (por ejemplo `KMQ482`).
- **Sin biometría ni ubicación:** no usa reconocimiento facial, huellas, GPS ni direcciones IP para la asistencia.
- **Los estudiantes solo leen:** con su código o QR consultan su asistencia y sus notas, pero no pueden modificar nada.

## Funciones principales

### Preparar el aula
| Paso | Qué hace |
|---|---|
| 1. Estudiantes | Carga desde Excel (nombre, apellido, curso, grupo, asignatura). Los **cursos y asignaturas se crean solos** si no existen. Editar, eliminar, eliminar curso o eliminar todo. Hojas de códigos imprimibles. |
| 2. Notas | Organizadas por **periodo**. El docente crea las notas y elige **promedio simple o por porcentajes**. Planilla tipo Excel: se navega con flechas y Enter y cada nota se guarda sola. |
| 3. Horarios | Horario semanal en forma de tabla, con **descansos** (recreo, almuerzo…) y tolerancia de llegada. |

### Día a día
- **Asistencia de tres formas:**
  - **Por código:** el docente abre un enlace por unos minutos y cada estudiante escribe su código en su celular.
  - **Con QR:** lector con cámara trasera; usa el lector nativo del navegador cuando existe.
  - **A mano:** botones A tiempo / Tarde / No llegó / Justificada.
- **Hora exacta** de cada registro. Si el docente llega tarde, puede **empezar la clase desde ese momento** solo por ese día, sin cambiar el horario.
- **Registro tardío:** con la clase cerrada, quien llega queda como **Tarde** con su hora real.
- **Seguimiento:** buscador de estudiantes, observaciones con prioridad y borrador automático.

### Resultados
- **Análisis** de asistencia y rendimiento, con alertas. Que dos datos coincidan no se presenta como causa y efecto.
- **Reportes PDF:** informe individual y **planilla de notas por curso**, con el logo de SIRAE y la marca "by Edutlan".
- **Consulta del estudiante** desde la pantalla de inicio: historial de asistencias (día, clase, hora) y notas.
- **Perfil de monitoreo** para el administrador: docentes, aulas, estudiantes y la última vez que cada uno usó el sistema. Este perfil no modifica datos.

## Registro de asistencia por código: cómo se protege

1. **Credencial única** por estudiante.
2. **Válida solo durante la jornada:** cada clase genera un enlace nuevo que vence (por ejemplo, a los 20 minutos).
3. **Un solo registro por código:** Disponible → Registrada → Bloqueada.
4. **Un dispositivo, un código por clase:** si un mismo celular intenta registrar a otro estudiante, se bloquea y el docente ve la alerta. Se usa un identificador temporal del navegador, nunca la IP.
5. **Pantalla bloqueada** para el estudiante hasta que el docente termina la asistencia o se acaba el tiempo.
6. **Cierre automático:** al vencer el tiempo no se aceptan más registros, la clase puede cerrarse sola y los controles temporales se borran.

## Experiencia de uso

- **Responsive:** menú lateral en computador; en el celular, menú deslizable, barra inferior y botón **+** de acciones rápidas en la zona del pulgar.
- **Atajos de teclado:** `Ctrl+K` para buscar, `Alt+1…8` para las secciones, `/` para el buscador de la página, `Alt+N` para un estudiante nuevo, `Alt+T` para cambiar el tema y `?` para ver la lista de atajos.
- **Tema claro u oscuro:** sigue el del sistema y se puede cambiar con un botón.
- **Accesibilidad:** foco visible, cierre con Esc, validación de formularios en línea y textos claros.
- **Red lenta o caída:** animación de carga, aviso de conexión lenta, reintentos automáticos y aviso sin conexión. Los escaneos QR hechos sin red se guardan y se envían después.
- **Cámara:** se enciende solo cuando el usuario la activa y se apaga sola al leer, al cambiar de pestaña o tras 60 segundos sin uso.
- **Página 404** propia.

La evaluación frente a la lista de chequeo de UX, movilidad y patrones (Pressman, caps. 12–14) está en [`docs/ux/checklist-interfaz.md`](docs/ux/checklist-interfaz.md).

## Tecnología

| Capa | Herramientas |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query, Recharts, Lucide |
| Backend | Node.js, Express 5, Zod, Mongoose |
| Base de datos | MongoDB (Atlas) |
| PDF y QR | PDFKit, qrcode, ZXing / BarcodeDetector |
| Despliegue | Vercel (estáticos + función `api/index.ts`) |

```
api/            Función de Vercel que atiende /api/*
client/src/     Interfaz: páginas, componentes, servicios y estilos
server/src/     API: rutas, controladores, servicios, modelos y validaciones
server/assets/  Logos para los PDF del servidor
public/         Logos, manifiesto y service worker
docs/           Guías (Vercel, MongoDB, respaldo, UX)
```

## Ejecutar en local

Requisitos: Node.js 22 o superior, pnpm y una base de datos MongoDB.

```bash
pnpm install
```
```bash
cp .env.example .env
```
Completa `.env`:

| Variable | Descripción |
|---|---|
| `MONGODB_URI` | Conexión a MongoDB |
| `AUTH_JWT_SECRET` | Texto aleatorio largo para firmar las sesiones |
| `AULANEXO_ADMIN_EMAIL` | Correo del administrador (perfil de monitoreo) |
| `AULANEXO_ADMIN_PASSWORD` | Clave del administrador |

```bash
pnpm dev
```
La aplicación queda en `http://localhost:3000`.

| Comando | Para qué |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm test` | Pruebas |
| `pnpm check` | Revisión de tipos |
| `pnpm build` | Compilación de producción |

> La cámara del navegador solo funciona con **https** o en `localhost`.

## Despliegue

Se despliega en **Vercel desde GitHub**: cada push a `main` publica una nueva versión. Configura en Vercel las mismas variables de entorno (más `NODE_ENV=production` y `APP_ORIGIN`). En MongoDB Atlas, permite el acceso desde Vercel. Detalles en [`docs/vercel.md`](docs/vercel.md).

## Privacidad

Los términos, la política de privacidad y las medidas de seguridad están explicados en lenguaje sencillo en la página **/legal** del sitio.

## Créditos

Desarrollado por **Cristian Miguel Peñata Andrade**, con el respaldo de **Edutlan** (Education · Technology · Language).

<p>
  <img src="public/edutlan-logo.webp" alt="Edutlan" width="140" />
</p>

## Licencia

Distribuido bajo la licencia **MIT**. Consulta el archivo [`LICENSE`](LICENSE).
