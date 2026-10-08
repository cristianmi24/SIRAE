import "dotenv/config";
import path from "node:path";
import express from "express";
import { createApp, addFinalErrorHandling } from "./app.js";
import { connectToDatabase, disconnectFromDatabase } from "./config/database.js";
import { getEnvironment } from "./config/env.js";

const projectDirectory = process.cwd();

async function attachFrontend() {
  const app = createApp();
  const environment = getEnvironment();

  if (environment.NODE_ENV === "production") {
    const clientDirectory = path.join(projectDirectory, "dist", "client");
    app.use(express.static(clientDirectory));
    app.get(/^(?!\/api).*/, (_request, response) => {
      response.sendFile(path.join(clientDirectory, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.join(projectDirectory, "vite.config.ts"),
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  addFinalErrorHandling(app);
  return app;
}

async function start(): Promise<void> {
  const environment = getEnvironment();
  const app = await attachFrontend();
  const server = app.listen(environment.PORT, "0.0.0.0", () => {
    console.info(`SIRAE está disponible en el puerto ${environment.PORT}.`);
  });

  void connectToDatabase()
    .then(() => console.info("MongoDB conectado."))
    .catch((error) => console.error("MongoDB no pudo conectarse; la API permanecerá en modo no disponible.", error));

  const shutdown = async () => {
    server.close(async () => {
      await disconnectFromDatabase();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void start();
