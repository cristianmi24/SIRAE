import { openDB } from "idb";
export interface PendingAttendance { scope: string; clientEventId: string; sessionId: string; tokenHash: string; deviceScannedAt: string; queuedAt: string; error?: string }
const database = openDB("aulanexo-offline-attendance", 1, { upgrade(db) { if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending", { keyPath: "clientEventId" }); } });
export async function queueAttendance(item: PendingAttendance): Promise<void> { (await database).put("pending", item); }
export async function listQueuedAttendance(scope: string): Promise<PendingAttendance[]> { return ((await database).getAll("pending") as Promise<PendingAttendance[]>).then((items) => items.filter((item) => item.scope === scope)); }
export async function removeQueuedAttendance(id: string): Promise<void> { (await database).delete("pending", id); }
export async function clearQueuedAttendance(): Promise<void> { (await database).clear("pending"); }
