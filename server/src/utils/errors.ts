export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, string>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = "Debes iniciar sesión para continuar.") =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "No tienes permiso para realizar esta acción.") =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "No se encontró el recurso solicitado.") =>
  new AppError(404, "NOT_FOUND", message);

export const conflict = (message = "Ya existe un registro con esa información.") =>
  new AppError(409, "CONFLICT", message);

export const unavailable = (message = "El servicio no está disponible temporalmente.") =>
  new AppError(503, "SERVICE_UNAVAILABLE", message);
