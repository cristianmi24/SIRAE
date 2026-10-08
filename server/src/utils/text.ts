export function normalizeForLookup(value: string): string {
  return value.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined && field !== ""),
  ) as T;
}
