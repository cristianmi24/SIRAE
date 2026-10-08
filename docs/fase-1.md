# AulaNexo — Fase 1

## Capacidades entregadas

La primera fase deja una aplicación React/Express conectada a MongoDB con autenticación local, aulas personales e instituciones administradas, roles `ADMIN`/`DOCENTE`, gestión de estudiantes, grupos académicos, QR de token opaco y auditoría de acciones de estudiante.

## Contrato REST

| Método | Ruta | Regla |
|---|---|---|
| `GET` | `/api/health` | Salud no autenticada; refleja disponibilidad de MongoDB. |
| `POST` | `/api/auth/login` | Valida correo y clave y establece una sesión HTTP-only. |
| `POST` | `/api/auth/register` | Crea un aula personal; el correo administrativo configurado crea la institución principal. |
| `GET` | `/api/auth/me` | Expone el perfil propio y el contexto institucional. |
| `POST` | `/api/auth/logout` | Revoca la cookie de aplicación. |
| `GET/POST` | `/api/course-groups` | Lista grupos autorizados; creación solo para `ADMIN`. |
| `GET/POST` | `/api/students` | Busca/lista o crea un estudiante y entrega QR de una sola visualización. |
| `GET/PATCH` | `/api/students/:id` | Obtiene o actualiza un estudiante del mismo `institutionId`. |
| `POST` | `/api/students/:id/deactivate` | Desactiva conservando historial y deja auditoría. |
| `GET` | `/api/students/:id/qr` | Explica el estado seguro de entrega QR. |
| `POST` | `/api/students/:id/qr/regenerate` | Invalida el QR anterior y entrega uno nuevo de una sola visualización. |
| `POST` | `/api/development/seed` | Carga diez perfiles ficticios solo fuera de producción y solo para `ADMIN`. |

## Privacidad QR

La base conserva `qrTokenHash`, nunca el token QR recuperable. Por ello, el QR se muestra al crear o regenerar el perfil y debe descargarse/imprimirse en ese momento. Regenerar revoca el código previo, aumenta su versión y registra auditoría. El contenido QR es un token aleatorio de 256 bits con prefijo técnico, sin nombre, documento ni información académica.

## Seguridad de solicitudes

Las mutaciones de `/api` validan que `Origin` o `Referer` coincidan con el origen público de AulaNexo. Esta capa protege la cookie de sesión `webdev_app_session` con `SameSite=None; Secure` dentro de la vista previa embebida. Las solicitudes desde otro origen se rechazan con `403 CSRF_REJECTED`.

Al cambiar o desasignar un grupo, AulaNexo cierra las matrículas activas anteriores y crea la nueva matrícula cuando corresponde. Desactivar un estudiante también cierra sus matrículas activas, sin borrar su historial.

## Operación de datos

- `pnpm seed:dev`: agrega de forma idempotente diez estudiantes ficticios y dos grupos después del primer inicio de sesión local de desarrollo.
- `pnpm indexes`: crea/verifica índices declarados sin eliminar índices existentes.
- El primer administrador de desarrollo solo se puede aprovisionar desde una conexión directa con dirección remota loopback y sin cabeceras de proxy; `Host: localhost` por sí solo no concede acceso. Una solicitud recibida desde Preview no se considera local aunque el proceso use `NODE_ENV=development`.
- En producción, se debe configurar mediante el gestor protegido `AULANEXO_ADMIN_EMAIL` y `AULANEXO_ADMIN_PASSWORD` la cuenta administradora principal. Esa cuenta administra instituciones y accesos; las demás cuentas nuevas comienzan como aulas personales.
- AulaNexo autentica localmente, guarda únicamente hashes de claves y permite que cualquier persona cree un aula personal de hasta seis cursos. El alta en una institución requiere una invitación vigente del administrador.
- El contrato `GetUserInfo` entrega `openId`, `name`, `email` y `platforms`; no incluye un campo `emailVerified` explícito. La aplicación compara el correo de identidad devuelto por el proveedor y no afirma que su verificación independiente se haya probado.
