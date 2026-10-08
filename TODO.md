# AulaNexo — Resultados y criterios de entrega

> La versión `aed9a58` está publicada en [https://rocas-etcrq2js.manus.space](https://rocas-etcrq2js.manus.space). La verificación pública confirma interfaz AulaNexo, `manus-routes.json` válido con 13 rutas y `/api/health` con MongoDB conectado. La primera versión `c044f0a` tenía una ruta estática incorrecta (`/dist/client/index.html`); se corrigió usando `process.cwd()`, se validó el bundle production y se publicó la corrección. `pnpm check`, las 23 pruebas y `pnpm build` pasan. El secreto productivo `AULANEXO_INITIAL_ADMIN_EMAIL` está configurado, sin guardar su valor. Los criterios E2E siguen abiertos hasta validar con sesión OAuth autorizada y datos en Mongo aislado; `GetUserInfo` no expone una marca `emailVerified` explícita. Las capturas visuales previas cubrieron la pantalla pública. La interfaz/título usan AulaNexo, aunque el hostname autogenerado todavía conserva el slug `rocas` y necesitaría dominio propio o cambio desde Webdev.

## Fase 1 — Base y estudiantes — Completada; validación integral parcial

- [x] SPA React + TypeScript y API REST Express + TypeScript; carpetas separadas de frontend, componentes, páginas, servicios, controladores, modelos, rutas, middleware, utilidades y tipos compartidos.
- [x] OAuth Manus real sin contraseña local, sesión HTTP-only compatible con Preview, perfiles internos, `ADMIN`/`DOCENTE`, aislamiento por `institutionId`, MongoDB externo y colecciones de instituciones, usuarios, membresías, estudiantes, grupos y matrículas; las altas ordinarias usan invitación que coincide con el correo OAuth y el administrador productivo inicial requiere el correo configurado como secreto.
- [x] CRUD conectado de estudiantes, consulta, búsqueda, filtros, perfil, alta/edición/desactivación y QR aleatorio/opaco cuya base conserva solo hash+versión.
- [x] Página pública responsive de AulaNexo con menú, accesos de iniciar/crear cuenta Manus y pie de página; shell autenticado y lista de estudiantes.
- [x] Comprobación de tipos, build y pruebas unitarias básicas pasan; MongoDB responde health conectado; pantalla pública de acceso revisada en escritorio y móvil.
- [ ] Ampliar la validación de aislamiento entre instituciones, control de permisos, accesos/errores de OAuth y operaciones completas con MongoDB; verificar con el proveedor la semántica de verificación de `GetUserInfo.email`, que el contrato recibido no expone como un campo `emailVerified` explícito.

## Fase 2 — Cámara y asistencia con QR — Implementación presente; aceptación E2E pendiente

- [ ] La pantalla “Tomar asistencia” permite seleccionar curso/grupo, asignatura, fecha y sesión, solicita permiso de cámara, muestra la cámara y detecta QR con ZXing en navegador; incluye registro manual cuando la cámara no existe o no tiene permiso.
- [ ] Al escanear en línea se valida token opaco en MongoDB, institución, estado activo del estudiante, sesión abierta y que la hora del servidor esté dentro del intervalo inclusivo configurado `[startsAt, endsAt]`; se muestra inmediatamente estudiante, estado/hora del servidor y confirmación visual comprensible. Un evento sincronizado desde offline puede llegar después del intervalo, pero siempre queda como pendiente de revisión docente y nunca usa la hora del dispositivo como asistencia autoritativa.
- [ ] Un QR inválido/inexistente, estudiante inactivo, sesión inexistente/cerrada, MongoDB no disponible, conexión perdida, falta de permiso de cámara o QR duplicado comunica un mensaje claro; el QR duplicado devuelve la hora del primer registro y no crea otro documento.
- [ ] MongoDB impide por índice único más de una asistencia por estudiante/sesión; varias solicitudes simultáneas/reintentos producen un único registro.

## Fase 3 — Horarios, sesiones y clasificación — Implementación presente; aceptación E2E pendiente

- [ ] Permite configurar asignatura, grupo, docente, días de clase, hora de inicio, finalización y minutos de tolerancia; no tiene reglas rígidas en código. Como regla de ejemplo, inicio 7:00 AM y tolerancia de 10 minutos significa 7:00–7:10 A tiempo y desde 7:11 Tarde.
- [ ] Docente puede registrar manualmente Presente, Tarde, Ausente o Ausencia justificada; correcciones exigen motivo, guardan autor, fecha, valor previo/nuevo y auditoría.
- [ ] Cierre de sesión registra como ausentes a estudiantes activos inscritos sin registro; antes de cierre no se confunde “sin escanear aún” con ausencia definitiva. Horas y días se muestran en zona horaria institucional; hora de asistencia online proviene del servidor.

## Fase 4 — Periodos, actividades y notas — Implementación presente; aceptación E2E pendiente

- [ ] Permite configurar asignaturas, periodos académicos, categorías, actividades, nota y porcentaje/peso; ejemplo: periodo 1, examen parcial, peso 30%, nota 4.2.
- [ ] Escala de calificación configurable por periodo con nota mínima/máxima y bandas/desempeño; la escala de ejemplo 0.0–2.9 Bajo, 3.0–3.9 Básico, 4.0–4.5 Alto, 4.6–5.0 Superior no se asume universal.
- [ ] Rechaza notas fuera del rango configurado y pesos/cálculos inválidos; calcula promedio, ponderado por actividades/categorías, nota por periodo, acumulada y desempeño desde notas almacenadas.

## Fase 5 — Observaciones, recursos e importación — Implementación presente; aceptación E2E pendiente

- [ ] Observaciones almacenan fecha, tipo, descripción, docente, prioridad, seguimiento y estado y permiten consultar el historial completo del estudiante.
- [ ] Recursos se pueden crear y gestionar con nombre, descripción, tipo, asignatura, curso, fecha, enlace, archivo y etiquetas; adjuntos validan extensión, MIME y contenido, límites de tamaño y permisos de descarga.
- [ ] Importaciones CSV/XLSX de estudiantes y recursos incluyen selección/lectura, detección y mapeo de columnas, previsualización, validación, detección de duplicados, errores por fila, resumen encontrados/válidos/duplicados/errores y confirmación explícita antes de importar definitivamente; errores señalan fila y campo; confirmar vuelve a validar y no inserta registros inválidos.

## Fase 6 — Dashboard y analítica — Implementación presente; aceptación E2E pendiente

- [ ] Dashboard presenta total, presentes, tardanzas, ausentes, justificadas, porcentaje de asistencia y puntualidad; gráficos y filtros por estudiante, curso, grupo, asignatura, fecha/rango y periodo.
- [ ] Analítica relaciona asistencia, puntualidad y notas desde datos persistidos; identifica posible baja asistencia+bajo rendimiento, alta asistencia+alto rendimiento, tardanzas frecuentes, descenso progresivo y necesidad de seguimiento.
- [ ] Alertas señalan baja asistencia, muchas tardanzas, asistencia perfecta y ausencias consecutivas con umbrales configurables.
- [ ] Toda descripción usa “posible relación” y no afirma que las ausencias causaron bajo rendimiento ni presenta correlación como causalidad.

## Fase 7 — Perfil completo y reportes PDF — Implementación presente; aceptación E2E pendiente

- [ ] Perfil incluye nombre, documento, curso/grupo, QR; porcentaje/asistencias/tardanzas/ausencias/justificadas; promedio, actividades, periodos y evolución; observaciones/seguimientos y síntesis limitada a datos disponibles.
- [ ] PDF profesional permite generar por estudiante, periodo, asignatura o rango; incluye identidad, curso/grupo, periodo, resumen/porcentaje de asistencia, tardanzas, ausencias/justificadas, notas/promedios/evolución, observaciones, recursos/actividades relevantes y resumen final basado exclusivamente en datos almacenados.
- [ ] Descargar/generar informe exige permiso de la institución; no expone reportes públicamente, en URL predecible ni a otro tenant, y registra la generación.

## Fase 8 — Seguridad, PWA/offline, auditoría y producción — Implementación presente; aceptación E2E pendiente

- [ ] Operaciones importantes —creación/edición/desactivación, QR, asistencia/correcciones, notas, importaciones, descargas e informes— quedan auditadas con actor, fecha, entidad y cambios pertinentes sin incluir secretos ni exponer datos fuera de autorización.
- [ ] PWA cachea recursos del shell, no respuestas académicas privadas. Escaneo temporal offline mantiene cola local idempotente sin PII; al recuperar red sincroniza sin duplicar, hora autoritativa del servidor, marca la captura offline para revisión y muestra estado de espera/sincronización/error.
- [ ] Seguridad incluye sesiones OAuth reales y permisos por rol/institución, protección CSRF, validación/sanitización, rechazo de inyección, límites por archivo y tasa, MIME/extensión/firma, secretos solo en servidor, y rutas de datos siempre autenticadas. Bootstrap abierto en desarrollo solo se acepta desde conexión loopback directa sin cabeceras de proxy; producción exige el correo OAuth autorizado configurado como secreto.
- [ ] Se genera exportación/respaldo de datos de institución autenticado y solo para administrador, registra auditoría y se documentan manejo y restauración controlada; no promete borrar objetos externos de almacenamiento.
- [ ] Build de contenedor instala desde lockfile, compila cliente/servidor, carga Vite solo en desarrollo, ejecuta como usuario sin privilegios `node`, usa `PORT`, incluye Docker HEALTHCHECK que consulta `/api/health` 2xx no autenticado, y configuración de despliegue mantiene `MONGODB_URI` en runtime y nunca en build/frontend. La vista pública de Preview HTTPS carga páginas y manifiesto de rutas sin errores por host; las descargas GridFS de recursos e informes PDF se envían con `Cache-Control: private, no-store`.
- [ ] Se finalizan las pruebas de reglas/API, QR válido/inválido/duplicado, a tiempo/tarde/ausencias, permisos de cámara, importaciones CSV/XLSX, notas fuera de rango, PDF, fallos de red/MongoDB y aislamiento.
- [x] La publicación no se infirió del checkpoint: el usuario confirmó la publicación única en la tarjeta de Webdev y la versión `aed9a58` terminó publicada; `publishing.auto_publish` sigue desactivado.
