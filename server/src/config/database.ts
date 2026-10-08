import mongoose from "mongoose";
import { getEnvironment } from "./env.js";

let connectionPromise: Promise<typeof mongoose> | undefined;

// Si la conexión se cae (por ejemplo, una instancia de Vercel que estuvo inactiva),
// se olvida la promesa anterior para que la siguiente petición vuelva a conectar.
mongoose.connection.on("disconnected", () => { connectionPromise = undefined; });
mongoose.connection.on("error", () => { if (mongoose.connection.readyState !== 1) connectionPromise = undefined; });

export async function connectToDatabase(): Promise<void> {
  const state = mongoose.connection.readyState;
  if (state === 1) return;
  // 0 = desconectado, 3 = desconectándose: una promesa ya resuelta no sirve, hay que reconectar.
  if (state === 0 || state === 3) connectionPromise = undefined;

  if (!connectionPromise) {
    const { MONGODB_URI } = getEnvironment();
    connectionPromise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      maxPoolSize: 10,
    });
  }

  try {
    await connectionPromise;
  } catch (error) {
    connectionPromise = undefined;
    throw error;
  }
}

// Conecta con reintentos cortos; útil en arranques en frío o redes inestables.
export async function ensureDatabase(attempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { await connectToDatabase(); return true; }
    catch (error) {
      if (attempt === attempts) { console.error("MongoDB no pudo conectarse.", error); return false; }
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  return false;
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectFromDatabase(): Promise<void> {
  connectionPromise = undefined;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
