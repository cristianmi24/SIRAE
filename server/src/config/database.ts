import mongoose from "mongoose";
import { getEnvironment } from "./env.js";

let connectionPromise: Promise<typeof mongoose> | undefined;

export async function connectToDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!connectionPromise) {
    const { MONGODB_URI } = getEnvironment();
    connectionPromise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8_000,
      connectTimeoutMS: 8_000,
    });
  }

  try {
    await connectionPromise;
  } catch (error) {
    connectionPromise = undefined;
    throw error;
  }
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
