import type { IncomingMessage, ServerResponse } from "node:http";
import { addFinalErrorHandling, createApp } from "../server/src/app.js";
import { ensureDatabase, isDatabaseReady } from "../server/src/config/database.js";

// Función de Vercel: atiende /api/* con la misma app Express del servidor.
// El frontend (dist/client) lo sirve Vercel como archivos estáticos.
const app = createApp();
addFinalErrorHandling(app);

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  // La conexión se reutiliza entre invocaciones de la misma instancia.
  if (!isDatabaseReady()) await ensureDatabase();
  return app(request as never, response as never);
}
