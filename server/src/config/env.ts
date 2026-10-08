import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI es obligatoria."),
  AUTH_JWT_SECRET: z.string().min(32, "AUTH_JWT_SECRET debe tener al menos 32 caracteres."),
  APP_ORIGIN: z.string().url().optional(),
  AULANEXO_INITIAL_INSTITUTION_NAME: z.string().trim().min(2).max(120).default("Institución SIRAE"),
  AULANEXO_ADMIN_EMAIL: z.string().trim().email().toLowerCase().optional(),
  AULANEXO_ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export function getEnvironment(): Environment {
  if (!cachedEnvironment) {
    cachedEnvironment = environmentSchema.parse(process.env);
  }

  return cachedEnvironment;
}

export function resetEnvironmentForTests(): void {
  cachedEnvironment = undefined;
}
