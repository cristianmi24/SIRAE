import { randomInt } from "node:crypto";
import type { Types } from "mongoose";
import { Student } from "../models/index.js";
import { normalizeForLookup } from "./text.js";

// Sin letras ni números que se confunden al leerlos (I/1, O/0).
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

export function generateStudentCode(): string {
  let code = "";
  for (let i = 0; i < 3; i++) code += LETTERS[randomInt(LETTERS.length)];
  for (let i = 0; i < 3; i++) code += DIGITS[randomInt(DIGITS.length)];
  return code;
}

export function normalizeStudentCode(value: string): string {
  return normalizeForLookup(value.replace(/[\s-]+/g, ""));
}

// Credencial alfanumérica única en todo SIRAE (no solo en el aula), por ejemplo "KMQ482".
export async function uniqueStudentCode(_institutionId: string | Types.ObjectId, reserved: Set<string> = new Set()): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const code = generateStudentCode();
    if (reserved.has(code)) continue;
    if (!await Student.exists({ documentNormalized: code })) { reserved.add(code); return code; }
  }
  throw new Error("No fue posible generar un código único para el estudiante.");
}
