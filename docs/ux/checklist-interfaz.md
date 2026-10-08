# Lista de chequeo del frontend: evidencias

Referencia: Pressman y Maxim (2019), capítulos 12 (UX), 13 (movilidad) y 14 (patrones).
Cada fila indica dónde se puede comprobar el criterio en la aplicación o en el código.

## Capítulo 12: experiencia de usuario

| ID | Evidencia en AulaNexo | Dónde verlo |
|---|---|---|
| UX-01 Arquitectura de información | Menú lateral agrupado por etapas del trabajo docente (Preparar el aula, Día a día, Resultados) con pasos numerados 1–5; Inicio con tarjeta "Primeros pasos"; migas de pan en la barra superior; buscador global (Ctrl+K). | `client/src/components/navigation.ts`, `AppShell.tsx`, `DashboardPage.tsx` |
| UX-02 Usuario en control | Botones Cancelar en todos los formularios y ventanas; confirmación antes de acciones irreversibles (cerrar clase, quitar nota, desactivar estudiante); vista previa antes de importar; borrador automático de observaciones con opción "Descartar". | `ObservationsPage.tsx` (`useDraft`), `ImportsPage.tsx`, `AttendancePage.tsx` |
| UX-03 Carga de memoria | Importación en 3 pasos; selector de clase que solo muestra las clases del día; valores por defecto (tolerancia, periodo activo, escala 0–5); textos de ayuda junto a los campos; placeholders de ejemplo. | `ImportsPage.tsx`, `AttendancePage.tsx`, `GradesPage.tsx` |
| UX-04 Consistencia | Un solo sistema de diseño (tokens de color en `:root`, tipografía Nunito, iconos Lucide del mismo grosor); clases `.button-primary`, `.button-secondary`, `.button-ghost` en todas las vistas; verbos uniformes ("Guardar", "Agregar", "Cancelar"). | `client/src/styles/index.css` |
| UX-05 Persona y tareas | Persona: docente de aula que toma asistencia y califica desde el celular. Las tareas frecuentes (tomar asistencia, registrar notas, observar) tienen acceso en 1 toque desde el botón de acciones rápidas y con Alt+1…8 en computador. | `AppShell.tsx` (acciones rápidas) |
| UX-06 Tognazzini | Botones de 48 px en móvil; estados de carga con spinner y textos ("Guardando…", "Revisando…") que deshabilitan el botón; casillas de notas que cambian de color al guardar o fallar; borradores en almacenamiento local. | `index.css` (`@media (max-width: 900px)`), `GradesPage.tsx` |
| UX-07 Accesibilidad (POUR) | Enlace "Saltar al contenido"; anillo de foco visible (`:focus-visible`); todas las ventanas se cierran con Esc y devuelven el foco; `<nav>`, `<main>`, `aria-current`, `aria-invalid`, `role="alert"` en errores; modo de movimiento reducido. | `AppShell.tsx`, `lib/ui-hooks.ts` (`useDialogBehavior`), `StudentForm.tsx` |
| UX-08 Prototipos y métricas | **Pendiente del equipo:** aplicar la prueba con 5 docentes y el cuestionario SUS (plantilla abajo). No se incluyen resultados porque deben venir de pruebas reales. | `docs/ux/checklist-interfaz.md` |

## Capítulo 13: diseño para la movilidad

| ID | Evidencia | Dónde verlo |
|---|---|---|
| MOB-01 Pirámide de diseño y responsive | Rejillas que pasan de 2–4 columnas a 1; el menú lateral se convierte en menú deslizable (drawer); tablas con desplazamiento interno, sin scroll horizontal de la página; líneas de texto limitadas a 60 caracteres. | `index.css` (media queries 1100, 900 y 640 px) |
| MOB-02 Zona del pulgar | Barra inferior fija (Inicio, Estudiantes, Asistencia, Notas, Menú) y botón flotante "+" con acciones rápidas en el tercio inferior; objetivos táctiles de 44–52 px con separación ≥ 8 px. | `AppShell.tsx` (`.mobile-bottom-nav`, `.fab`) |
| MOB-03 Contexto | Modo oscuro automático (`prefers-color-scheme`) y manual (Alt+T o botón sol/luna); teclados especializados (`inputMode` decimal en notas, `email`, `tel`); en horizontal la cámara y la lista de asistencia quedan lado a lado. | `index.css`, `StudentForm.tsx`, `GradesPage.tsx` |
| MOB-04 Resiliencia de red | Aviso "Sin conexión" no invasivo en la barra superior; los escaneos QR se guardan en IndexedDB y se sincronizan al volver la red; peticiones asíncronas con TanStack Query; módulos cargados de forma diferida (`lazy`). | `AppShell.tsx` (`useOnlineStatus`), `lib/offline-attendance.ts`, `App.tsx` |

## Capítulo 14: diseño basado en patrones

| ID | Evidencia | Dónde verlo |
|---|---|---|
| PAT-01 Componentes y separación | Vistas en `pages/`, piezas reutilizables en `components/` y `features/`, acceso a datos solo en `services/api.ts`, hooks de interfaz en `lib/`; estado de servidor con TanStack Query (flujo unidireccional). | `client/src/` |
| PAT-02 Navegación | Menú lateral / drawer con elemento activo resaltado; migas de pan; pestañas segmentadas (periodos en Notas, Docentes/Instituciones en Monitoreo, forma de cálculo de la definitiva). | `AppShell.tsx`, `GradesPage.tsx`, `MonitoringPage.tsx` |
| PAT-03 Formularios | Validación campo a campo al salir del campo (`mode: "onTouched"`) con borde rojo y mensaje debajo; selectores de fecha y hora nativos; formularios agrupados en tarjetas y secciones plegables. | `StudentForm.tsx`, `index.css` (`[aria-invalid]`) |
| PAT-04 Antipatrones | Ningún componente supera 200 líneas; todos los botones de solo icono tienen `aria-label` y `title`; nunca se abre una ventana modal sobre otra. | `wc -l client/src/**/*.tsx` |

## Atajos de teclado

| Atajo | Acción |
|---|---|
| Ctrl+K | Buscar estudiantes o ir a una sección |
| / | Ir al buscador de la página |
| Alt+1 … Alt+8 | Inicio, Estudiantes, Notas, Horarios, Asistencia, Seguimiento, Análisis, Reportes |
| Alt+N | Registrar estudiante |
| Alt+T | Tema claro u oscuro |
| Flechas y Enter | Moverse por la planilla de notas como en Excel |
| Esc | Cerrar ventanas y menús |
| ? | Ver la lista de atajos |

## Plantilla de prueba de usabilidad (UX-08)

Tareas para 5 docentes:
1. Cargar una lista de estudiantes desde Excel.
2. Crear las notas de un periodo con porcentajes y calificar a 3 estudiantes.
3. Armar el horario de un curso con un descanso.
4. Tomar asistencia de una clase y cerrarla.
5. Descargar el informe PDF de un estudiante.

Cuestionario SUS (1 = totalmente en desacuerdo, 5 = totalmente de acuerdo):
1. Creo que me gustaría usar este sistema con frecuencia.
2. Encontré el sistema innecesariamente complejo.
3. Pensé que el sistema era fácil de usar.
4. Creo que necesitaría ayuda de una persona con conocimientos técnicos para usarlo.
5. Las funciones del sistema estaban bien integradas.
6. Pensé que había demasiada inconsistencia en el sistema.
7. Imagino que la mayoría de las personas aprendería a usarlo muy rápido.
8. Encontré el sistema muy difícil de usar.
9. Me sentí muy seguro al usar el sistema.
10. Necesité aprender muchas cosas antes de poder usarlo.

Cálculo: ítems impares (respuesta − 1), ítems pares (5 − respuesta); sumar y multiplicar por 2,5. Un puntaje mayor a 68 se considera por encima del promedio.

| Docente | Tareas completadas | Tiempo total | Puntaje SUS | Observaciones |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
