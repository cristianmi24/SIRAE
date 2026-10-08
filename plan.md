# AulaNexo — Plan de implementación

## Objetivo

Construir una herramienta integral para que docentes e instituciones organicen estudiantes, asistencia, horarios, notas, seguimiento, recursos, análisis y reportes desde cualquier dispositivo. Entregar por fases, preservar datos privados y evitar interfaces de demostración desconectadas de MongoDB. Los criterios completos de comportamiento y sus estados están en `TODO.md`.

## Decisiones de arquitectura

- **Aplicación:** React 19, TypeScript, Vite, Tailwind CSS, React Router y TanStack Query. Páginas separadas por módulo; carga diferida de cada módulo para no incorporar QR, gráficos ni herramientas de importación al primer recurso.
- **Servidor:** Node.js 22, Express 5, TypeScript y API REST bajo `/api`. Módulos separados para rutas, controladores, servicios, validadores, modelos, middleware y utilidades. El desarrollo carga Vite dinámicamente como middleware; producción resuelve la raíz del proyecto desde `process.cwd()` (Docker define `/app` como `WORKDIR`) y sirve `dist/client` desde el mismo proceso Express sin requerir el paquete de desarrollo.
- **Persistencia:** MongoDB externo mediante `MONGODB_URI` en el entorno del servidor, Mongoose para documentos e índices y GridFS para adjuntos privados. La capacidad de base administrada de Webdev permanece deshabilitada (`database:false`); nunca se usa MySQL gestionado para reemplazar la elección explícita de MongoDB.
- **Aislamiento y acceso:** toda consulta institucional usa `institutionId`; los administradores operan dentro de su institución y los docentes quedan limitados a grupos asignados. La autenticación es local con claves hasheadas mediante scrypt y sesiones HTTP-only firmadas con `AUTH_JWT_SECRET`. Cada alta ordinaria crea un aula personal con máximo seis cursos; la cuenta administrativa configurada es la única que crea y administra instituciones.
- **Asistencia offline:** el QR contiene un token aleatorio opaco y MongoDB guarda solo su hash. La cola IndexedDB usa alcance institucional, ID idempotente, hash y hora del dispositivo, sin nombres ni documentos. El QR online usa la hora del servidor y solo acepta capturas en el intervalo inclusivo `[startsAt, endsAt]` de la sesión; la tolerancia configura A tiempo/Tarde dentro de esa sesión. Las capturas sincronizadas desde offline se mantienen como pendientes de revisión, incluso fuera de la ventana, y no usan la hora del dispositivo para decidir asistencia. El Service Worker almacena el shell/activos públicos y nunca cachea `/api/` ni recursos privados.
- **Aprendizaje y análisis:** horarios, zonas IANA, tolerancias, periodos, pesos, escalas y umbrales son datos configurables, no reglas rígidas. Gráficos y alertas describen asociaciones entre asistencia y rendimiento; la UI, la síntesis y los informes dicen explícitamente que correlación no demuestra causalidad.
- **Informes y almacenamiento:** el PDF individual se compone solo con datos persistidos, se autoriza por institución/grupo, se envía como `application/pdf` con descarga privada `no-store` y se audita. Los objetos GridFS no se publican en URLs públicas.
- **Instalación y rutas:** `public/manifest.webmanifest`, icono y Service Worker pertenecen a la app (`manifestMode: application_owned`). `public/manus-routes.json` enumera todas las páginas UI, incluidas rutas dinámicas, no endpoints REST.

## Fases de producto

1. **Base y estudiantes:** identidad OAuth/invitaciones, instituciones, membresías, grupos y CRUD/perfil de estudiante.
2. **Asistencia QR:** cámara, escaneo, corrección/manual y reintentos idempotentes.
3. **Horarios:** días, horario, tolerancia, sesiones, hora institucional y cierre con ausencias.
4. **Notas:** materias, periodos, categorías, actividades, escalas y promedios.
5. **Seguimiento y recursos:** observaciones, adjuntos GridFS e importación validada CSV/XLSX con preview y confirmación explícita.
6. **Analítica:** métricas, tendencias, filtros y alertas configurables con lenguaje no causal.
7. **Informes:** perfil académico y PDF privado a partir de filtros válidos.
8. **Gobierno y producción:** auditoría, invitaciones/membresías, límites, respaldo privado, PWA, documentación de restauración y contenedor reproducible.

## Estructura del proyecto

- `client/src/app/`: enrutamiento, estado de autenticación y composición de páginas.
- `client/src/pages/`: panel, estudiantes/perfil, asistencia, horarios, notas, observaciones, recursos, importaciones, analítica, PDF, administración y auditoría.
- `client/src/components/`, `client/src/lib/`, `client/src/services/`, `client/src/styles/`: piezas de interfaz accesibles, cola local, cliente REST y lenguaje visual responsive.
- `server/src/config/`: lectura de variables, conexión y disponibilidad de MongoDB.
- `server/src/middleware/`, `server/src/routes/`, `server/src/controllers/`: sesión/roles/CSRF, URL REST y límites HTTP.
- `server/src/services/`, `server/src/models/`, `server/src/validators/`, `server/src/utils/`: reglas de negocio, colecciones e índices, contratos Zod y funciones deterministas.
- `shared/`: tipos compartidos entre cliente y servidor.
- `public/`: shell instalable, icono, manifiesto, Service Worker y manifiesto de rutas.
- `scripts/`: preparación explícita de índices y datos ficticios de desarrollo. No sembrar el clúster externo compartido como parte de una prueba.
- `docs/`: operación por fase y límites de respaldo/restauración.

## Diseño y marca

- **Movimiento:** editorialismo institucional contemporáneo, con referencias a la claridad tipográfica suiza y a una libreta docente bien organizada.
- **Principios:** legibilidad antes que decoración; jerarquía académica clara; interacción operacional de pocos pasos; información privada y estados de sincronización siempre visibles.
- **Filosofía de color:** azul tinta `#173F5F` comunica confianza y estructura; oro suave `#E7C56E` marca el nexo y las acciones de identidad; fondos marfil `#F6F7F5` y acentos de agua pálida reducen fatiga. Verde/ámbar/rojo se reservan para estados comprensibles y no dependen solo del color.
- **Paradigma de layout:** rail institucional persistente en escritorio con contenido de ancho fluido; en móvil, navegación inferior para Panel/Asistencia/Estudiantes/Notas y menú “Más”; las vistas de operación favorecen listas y paneles de contexto en vez de una portada genérica en rejilla.
- **Elementos distintivos:** símbolo de tres trazos escalonados (un aula conectada); chips discretos de estado para presente/tarde/pendiente; grandes titulares serif sobre superficies blancas y fondos acuosos.
- **Interacción:** permisos de cámara solo bajo solicitud; indicadores claros de abierto/cerrado, offline/en cola y sincronización; una acción confirmada muestra su resultado junto al contexto; accesible por teclado con foco visible y alternativa manual.
- **Animación:** respuestas pequeñas de 140–180 ms para hover/cambio de estado, giro solo para carga real, sin movimiento ambiental y respeto a `prefers-reduced-motion`.
- **Tipografía:** Times New Roman/Times para una identidad académica clásica en la interfaz; se conserva una jerarquía compacta para tablas y buena lectura a 320 px.
- **Esencia:** “Gestión institucional que conecta el aula con decisiones docentes más claras”; personalidad serena, útil y cuidadosa.
- **Voz:** directa, pedagógica y sin promesas clínicas: “Tu aula conectada. Tus decisiones, más claras.” y “La captura offline quedará pendiente de revisión docente.”
- **Logotipo:** wordmark AulaNexo con espaciado propio y un emblema cuadrado de tres trazos inclinados/escalonados que sugieren aula, conexión y progreso; `#173F5F` es el color de marca identificable.

## Runtime y publicación

`Dockerfile` compila cliente y servidor desde el lockfile con Node 22/pnpm, instala solo dependencias de producción en la etapa final, ejecuta como usuario `node` y arranca `node dist/index.js`; Vite se importa únicamente en desarrollo. La vista de desarrollo solo permite hosts locales predeterminados y el sufijo oficial `.us4.manus.computer`, no todos los hosts. El listener usa `PORT` (3000 como valor local de referencia) en `0.0.0.0`. `/api/health` es la ruta de readiness no autenticada y comprueba conexión MongoDB; Docker HEALTHCHECK consulta esa ruta. La URI Mongo se consulta en runtime: no se copia al cliente, a la imagen ni al build. Webdev tiene el servidor habilitado, la base MySQL administrada deshabilitada y el contrato de contenedor apunta al Dockerfile existente. Guardar un checkpoint no equivale a publicar; una publicación se mantiene separada y solo ocurre mediante la acción de Publish.
