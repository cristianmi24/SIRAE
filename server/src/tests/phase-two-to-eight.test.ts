import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseImportUpload, type ImportUpload } from "../services/imports.js";
import { classifyPunctuality, isWithinAttendanceWindow, localDateTime } from "../utils/school-time.js";
import { periodInput, scheduleInput } from "../validators/learning.js";

function upload(name: string, mime: string, bytes: Buffer): ImportUpload {
  return { originalname: name, mimetype: mime, buffer: bytes, size: bytes.length };
}

describe("regla de puntualidad y zona horaria", () => {
  const start = new Date("2026-10-06T12:00:00.000Z");
  it("incluye hasta el segundo final del minuto de tolerancia y marca tarde al minuto siguiente", () => {
    expect(classifyPunctuality(new Date(start.getTime() + 10 * 60_000 + 59_999), start, 10)).toBe("PRESENT");
    expect(classifyPunctuality(new Date(start.getTime() + 11 * 60_000), start, 10)).toBe("LATE");
    expect(classifyPunctuality(start, start, 0)).toBe("PRESENT");
    expect(classifyPunctuality(new Date(start.getTime() + 60_000), start, 0)).toBe("LATE");
  });

  it("acepta QR online solo dentro de los límites inclusivos del horario de sesión", () => {
    const end = new Date(start.getTime() + 60 * 60_000);
    expect(isWithinAttendanceWindow(start, start, end)).toBe(true);
    expect(isWithinAttendanceWindow(end, start, end)).toBe(true);
    expect(isWithinAttendanceWindow(new Date(start.getTime() - 1), start, end)).toBe(false);
    expect(isWithinAttendanceWindow(new Date(end.getTime() + 1), start, end)).toBe(false);
    expect(() => isWithinAttendanceWindow(start, start, start)).toThrow("horario");
  });

  it("interpreta la hora local institucional sin depender del huso del servidor", () => {
    expect(localDateTime("2026-10-06", "07:00", "America/Bogota").toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(localDateTime("2026-07-14", "07:00", "America/New_York").toISOString()).toBe("2026-07-14T11:00:00.000Z");
  });

  it("rechaza horas de tolerancia inválidas en las reglas almacenables", () => {
    const validId = "0123456789abcdef01234567";
    expect(scheduleInput.parse({ courseGroupId: validId, subjectId: validId, weekdays: [1, 5], startTime: "07:00", endTime: "08:00", toleranceMinutes: 10 }).toleranceMinutes).toBe(10);
    expect(() => scheduleInput.parse({ courseGroupId: validId, subjectId: validId, weekdays: [], startTime: "07:00", endTime: "07:00", toleranceMinutes: 181 })).toThrow();
  });
});

describe("validación de periodos y escalas configurables", () => {
  const base = { name: "Periodo 1", startsOn: "2026-01-01", endsOn: "2026-06-30", min: 1, max: 5, bands: [{ label: "Bajo", min: 1, max: 2.9 }, { label: "Básico", min: 3, max: 3.9 }, { label: "Alto", min: 4, max: 4.5 }, { label: "Superior", min: 4.6, max: 5 }] };
  it("admite escalas y etiquetas de desempeño personalizables que cubren valores dentro del rango", () => {
    expect(periodInput.parse(base).bands).toHaveLength(4);
  });
  it("rechaza bandas solapadas y periodos invertidos", () => {
    expect(() => periodInput.parse({ ...base, endsOn: "2025-12-31" })).toThrow();
    expect(() => periodInput.parse({ ...base, bands: [{ label: "A", min: 1, max: 3 }, { label: "B", min: 2, max: 4 }] })).toThrow();
  });
});

describe("parseo seguro CSV/XLSX", () => {
  it("lee CSV UTF-8 con BOM, encabezados y filas", async () => {
    const file = upload("estudiantes.csv", "text/csv", Buffer.from("\uFEFFnombre,apellido,documento\nMaría,López,ID-1\n", "utf8"));
    const parsed = await parseImportUpload(file);
    expect(parsed.headers).toEqual(["nombre", "apellido", "documento"]);
    expect(parsed.rows).toEqual([{ nombre: "María", apellido: "López", documento: "ID-1" }]);
  });

  it("rechaza encabezados duplicados y bytes CSV que no son UTF-8", async () => {
    await expect(parseImportUpload(upload("estudiantes.csv", "text/csv", Buffer.from("nombre,NOMBRE\nAna,Ana\n", "utf8")))).rejects.toThrow("encabezados");
    await expect(parseImportUpload(upload("estudiantes.csv", "text/csv", Buffer.from([0xc3, 0x28, 0x0a, 0x41, 0x2c, 0x42])))).rejects.toThrow("dañado");
  });

  it("lee XLSX genuino y selecciona la primera hoja como fuente", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Alumnos");
    sheet.addRows([["nombre", "apellido", "documento"], ["Ana", "Sol", "ID-2"]]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseImportUpload(upload("estudiantes.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer));
    expect(parsed.rows[0]).toEqual({ nombre: "Ana", apellido: "Sol", documento: "ID-2" });
  });

  it("rechaza un archivo con firma XLSX pero directorio ZIP inválido", async () => {
    const fake = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    await expect(parseImportUpload(upload("estudiantes.xlsx", "application/zip", fake))).rejects.toThrow("directorio ZIP válido");
  });

  it("rechaza un XLSX de expansión desproporcionada antes de descomprimirlo con ExcelJS", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Alumnos");
    sheet.addRows([["nombre", "apellido", "documento"], ["Ana", "Sol", "ID-3"]]);
    sheet.getCell("A3").value = "A".repeat(1_500_000);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseImportUpload(upload("estudiantes.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer))).rejects.toThrow("expansión");
  });
});
