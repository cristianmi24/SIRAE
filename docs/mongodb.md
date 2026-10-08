# Configuración de MongoDB — AulaNexo

La conexión con MongoDB ya está integrada en el servidor mediante Mongoose. No se
usa una base de datos local ni la base administrada de la plataforma: el servidor
lee `MONGODB_URI` desde el entorno.

## Configuración local

1. Crea el archivo `.env` en la raíz copiando `.env.example`.
2. Define una URI de MongoDB válida, por ejemplo:

   ```dotenv
   MONGODB_URI=mongodb+srv://<usuario>:<contraseña>@<cluster>/<base>?retryWrites=true&w=majority
   ```

3. En MongoDB Atlas, agrega la IP desde la que se ejecutará el servidor a
   **Network Access** y crea un usuario con permisos únicamente sobre la base
   `aulanexo`.
4. Arranca el servidor:

   ```powershell
   pnpm dev
   ```

5. Comprueba la conexión:

   ```powershell
   Invoke-RestMethod http://localhost:3000/api/health
   ```

   La respuesta esperada es `status: "ok"` y `database: "connected"`.

La aplicación puede iniciar el servidor HTTP aunque MongoDB no esté disponible;
en ese caso `/api/health` responde `503` y las operaciones que necesitan datos no
están disponibles. La URI se valida al arrancar y nunca debe publicarse ni
guardarse en el repositorio.

## Preparación de colecciones e índices

Después de confirmar la conectividad, crea o verifica los índices declarados por
los modelos:

```powershell
pnpm indexes
```

El script es idempotente y no elimina índices existentes. Incluye aislamiento
por `institutionId`, unicidad de documentos y grupos, idempotencia de
asistencias y las búsquedas principales.

Para un entorno de desarrollo con una institución y una sesión ya creadas,
siembra únicamente datos ficticios:

```powershell
pnpm seed:dev
```

Este comando requiere iniciar sesión al menos una vez y no debe ejecutarse
contra una base productiva o compartida.

## Producción

- Configura `MONGODB_URI` mediante el gestor de secretos del proveedor.
- Restringe el usuario de MongoDB a la base de AulaNexo y limita las IPs
  permitidas.
- Configura `AULANEXO_ADMIN_EMAIL` y `AULANEXO_ADMIN_PASSWORD` mediante el
  gestor de secretos. La clave nunca debe guardarse en documentación.
- Ejecuta `pnpm indexes` como paso controlado de despliegue.
- Supervisa `/api/health`; un estado `503` indica que el proceso está activo,
  pero no tiene una conexión disponible.
- Realiza respaldos de MongoDB y conserva el procedimiento de
  [respaldo y restauración](./backup-restore.md). Los respaldos de AulaNexo
  contienen datos personales y no están cifrados por la aplicación.

## Componentes ya conectados

- [server/src/config/database.ts](../server/src/config/database.ts): conexión
  reutilizable, timeouts y desconexión ordenada.
- [server/src/config/env.ts](../server/src/config/env.ts): validación de
  `MONGODB_URI` y variables del entorno.
- [server/src/models/index.ts](../server/src/models/index.ts) y
  [server/src/models/learning.ts](../server/src/models/learning.ts): modelos e
  índices de las colecciones.
- [server/src/app.ts](../server/src/app.ts): endpoint `/api/health`.
- [server/src/index.ts](../server/src/index.ts): carga de variables, conexión
  al arrancar y cierre limpio.
