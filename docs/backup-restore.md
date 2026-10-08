# Respaldo y restauración controlada — AulaNexo

## Respaldo

El endpoint administrativo `GET /api/learning/backup` produce un `.json.gz` con versión de formato `aulanexo-backup-v1`, ID institucional, fecha, colecciones propias del tenant y adjuntos del bucket GridFS `aulanexoResources`. El servidor limita a 20.000 documentos por colección, 500 adjuntos y 50 MiB de binario; devuelve error si se supera el límite. El ZIP/gzip **no cifra** su contenido: protege la transferencia con HTTPS y exige sesión + rol `ADMIN`, pero quien conserve el archivo puede leer sus datos. Guárdalo en almacenamiento cifrado con acceso restringido y política de retención. Nunca lo adjuntes a tickets o canales públicos.

El archivo puede contener nombres, correos, documentos académicos, observaciones, calificaciones y el identificador opaco de cuenta Manus necesario para restablecer la relación de acceso. No contiene claves de MongoDB, cookies, tokens de sesión ni secretos de aplicación.

## Restauración

La versión inicial incluye el formato y un procedimiento operativo controlado; no hay un botón de restauración remota. Antes de restaurar:

1. Verifica origen, tenant/ID institucional, fecha, integridad gzip y permisos del respaldo.
2. Asegura una copia del MongoDB actual y detén escrituras de la aplicación durante el procedimiento.
3. Restaura solo en una instancia de recuperación aislada. No cargues documentos sobre una institución activa ni combines colecciones de tenants.
4. Comprueba que los índices únicos estén presentes; reconcilia usuarios OAuth con las cuentas institucionales esperadas y actualiza accesos mediante invitación si la identidad cambió.
5. Valida recuentos, relaciones, adjuntos GridFS, asistencia/notas de muestra y registros de auditoría antes de reabrir la institución.
6. Documenta aprobador, operador, fecha, origen y resultado; al finalizar, retira accesos de recuperación y conserva la evidencia según la política escolar.

La exportación actual es de solo lectura y no elimina datos, archivos ni objetos externos. La restauración en producción debe ejecutarla un operador autorizado, con una copia previa y revisión humana; no se ofrece sobrescritura automática.
