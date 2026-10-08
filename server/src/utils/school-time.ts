import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { parseISO, isValid } from "date-fns";
import { AppError } from "../utils/errors.js";

export function localDateTime(dateKey: string, time: string, timezone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AppError(400, "VALIDATION_ERROR", "La fecha o la hora no es válida.");
  const calendarDate = parseISO(`${dateKey}T12:00:00`);
  if (!isValid(calendarDate) || formatInTimeZone(calendarDate, timezone, "yyyy-MM-dd") !== dateKey) throw new AppError(400, "VALIDATION_ERROR", "La fecha no existe en el calendario.");
  try { return fromZonedTime(`${dateKey}T${time}:00`, timezone); }
  catch { throw new AppError(400, "VALIDATION_ERROR", "La zona horaria institucional no es válida."); }
}
export function isoWeekday(dateKey: string, timezone: string): number {
  const date = localDateTime(dateKey, "12:00", timezone);
  const day = Number(formatInTimeZone(date, timezone, "i"));
  return day;
}
export function timeInZone(date: Date, timezone: string): string { return formatInTimeZone(date, timezone, "HH:mm"); }
export function dateKeyInZone(date: Date, timezone: string): string { return formatInTimeZone(date, timezone, "yyyy-MM-dd"); }
export function classifyPunctuality(scannedAt: Date, startsAt: Date, toleranceMinutes: number): "PRESENT" | "LATE" {
  if (!Number.isFinite(scannedAt.getTime()) || !Number.isFinite(startsAt.getTime()) || !Number.isInteger(toleranceMinutes) || toleranceMinutes < 0 || toleranceMinutes > 180) throw new AppError(400, "SCHEDULE_INVALID", "La hora o tolerancia de la sesión no es válida.");
  const cutoffExclusive = startsAt.getTime() + (toleranceMinutes + 1) * 60_000;
  return scannedAt.getTime() < cutoffExclusive ? "PRESENT" : "LATE";
}

export function isWithinAttendanceWindow(scannedAt: Date, startsAt: Date, endsAt: Date): boolean {
  const scan = scannedAt.getTime();
  const start = startsAt.getTime();
  const end = endsAt.getTime();
  if (!Number.isFinite(scan) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new AppError(400, "SCHEDULE_INVALID", "El horario de la sesión no es válido.");
  return scan >= start && scan <= end;
}
