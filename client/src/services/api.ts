import type { AuthUserDto, PaginatedResult, StudentDto } from "../../../shared/types";

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: Record<string, string>) { super(message); this.name = "ApiClientError"; }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, credentials: "include", headers });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : undefined;
  if (!response.ok) throw new ApiClientError(response.status, payload?.error?.code || "REQUEST_FAILED", payload?.error?.message || "No fue posible completar la solicitud.", payload?.error?.details);
  return payload as T;
}
async function download(path: string): Promise<void> {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) { const payload = await response.json().catch(() => undefined); throw new ApiClientError(response.status, payload?.error?.code || "DOWNLOAD_FAILED", payload?.error?.message || "No se pudo descargar el archivo."); }
  const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = decodeURIComponent(response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] || "aulanexo-archivo"); document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export interface AuthState { authenticated: boolean; database?: "unavailable"; message?: string; user?: AuthUserDto }
export interface CourseGroupDto { id: string; grade: string; group: string; academicYear: number; label: string }
export interface StudentInput { firstName: string; lastName: string; document?: string; courseGroupId?: string | null; email?: string | null; phone?: string | null }
export interface QrDelivery { dataUrl: string; version: number; oneTimeNotice: string }
export interface SubjectDto { id: string; name: string; code?: string; active: boolean; courseGroupIds?: string[] }
export interface PeriodDto { id: string; name: string; startsOn: string; endsOn: string; active: boolean; scale: { min: number; max: number; bands: { label: string; min: number; max: number }[] } }
export interface ScheduleDto { id: string; courseGroupId: string; subjectId: string; teacherUserId?: string; weekdays: number[]; startTime: string; endTime: string; toleranceMinutes: number; timezone: string; active: boolean }
export interface SessionDto { id: string; scheduleId: string; courseGroupId: string; subjectId: string; dateKey: string; startsAt: string; endsAt: string; timezone: string; state: "OPEN" | "CLOSED"; scheduledStartsAt?: string; toleranceMinutes?: number; adjustedAt?: string }
export interface RosterLine { studentId: string; studentName: string; document: string; status: "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED" | "PENDING_REVIEW"; label: string; recordedAt?: string; source?: string; requiresReview: boolean; reason?: string; hasRecord: boolean }
export interface PeriodInput { name: string; startsOn: string; endsOn: string; min: number; max: number; bands: { label: string; min: number; max: number }[] }
export interface AnalyticsThresholds { attendanceLowPercent: number; attendanceHighPercent: number; performanceLowPercent: number; performanceHighPercent: number; lateCount: number; consecutiveAbsences: number }
export interface AnalyticsStudent { id: string; name: string; document: string; courseGroupId: string; totalSessions: number; present: number; late: number; absent: number; justified: number; pendingReview: number; attendancePercent?: number; punctualityPercent?: number; average?: number; performance?: string; performancePercent?: number; periodTrend: { periodId: string; periodName: string; average: number; performancePercent?: number; performance?: string; startsOn: string }[]; pattern?: string }
export interface AnalyticsDto { filters: Record<string, string | undefined>; thresholds: AnalyticsThresholds; totals: { students: number; sessions: number; present: number; late: number; absent: number; justified: number; attendancePercent: number; punctualityPercent: number }; students: AnalyticsStudent[]; alerts: { type: string; studentId: string; studentName: string; message: string }[]; trend: { date: string; present: number; late: number; absent: number; justified: number; pendingReview?: number }[]; interpretation: string }
export interface ImportPreviewDto { id: string; kind: "students"; headers: string[]; mapping: Record<string, string>; summary: { found: number; valid: number; duplicates: number; errors: number }; errors: { row: number; field: string; message: string }[]; newCourses: string[]; newSubjects: string[]; preview: Record<string, string>[] }
export type GradingMode = "WEIGHTED" | "AVERAGE";
export interface GradeCategoryDto { id: string; periodId: string; subjectId: string; name: string; weightPercent: number; mode: GradingMode }
export interface AssessmentDto { id: string; periodId: string; subjectId: string; categoryId: string; name: string; weightPercent: number; dueAt?: string }
export interface GradeRowDto { id: string; studentId: string; studentName: string; assessment: { _id: string; name: string; periodId: string; periodName: string; subjectId: string; categoryId: string; weightPercent: number }; value: number; feedback?: string }
export interface ScheduleBreakDto { id: string; courseGroupId?: string; label: string; weekdays: number[]; startTime: string; endTime: string }
export interface PlatformOverviewDto {
  totals: { institutions: number; personalClassrooms: number; teachers: number; activeTeachers7d: number; activeTeachers30d: number; students: number; courses: number; sessions: number; grades: number; observations: number };
  teachers: { id: string; name: string; email: string; active: boolean; createdAt?: string; lastSeenAt?: string; lastLoginAt?: string; institutionName?: string; institutionType?: "PERSONAL" | "INSTITUTION"; role?: string; students: number; courses: number; sessions: number }[];
  institutions: { id: string; name: string; type: "PERSONAL" | "INSTITUTION"; active: boolean; owner?: string; createdAt?: string; members: number; students: number; totalStudents: number; courses: number; sessions: number; lastActivityAt?: string }[];
}
export interface StudentReportDto {
  institutionName: string; generatedAt: string; studentName: string; documentNumber: string; groupLabel: string; periodName: string; subjectName: string; fromKey?: string; toKey?: string; timezone: string; sessionCount: number;
  attendance: { present: number; late: number; absent: number; justified: number; pendingReview: number }; attendancePercent?: number;
  grades: { periods: { name: string; average: number; performance?: string }[]; average?: number; performance?: string; assessments: { periodName: string; subjectName: string; name: string; value: number; feedback?: string }[]; categories: { periodId: string; periodName: string; subjectId: string; subjectName: string; average?: number; weightPercent: number }[] };
  observations: { observedAt: string; type: string; priority: string; status: string; description: string; followUp?: string }[];
}
export interface CourseGradesReportDto { institutionName: string; generatedAt: string; course: { id: string; label: string; academicYear: number }; period?: { id: string; name: string; scale: PeriodDto["scale"] }; subjects: { id: string; name: string }[]; students: { id: string; name: string; document: string; grades: Record<string, number>; average?: number }[] }
export interface AttendanceLinkDto { state: "OFF" | "ACTIVE" | "EXPIRED"; token?: string; opensAt?: string; expiresAt?: string; autoClose: boolean; sessionState: string; registered: number; alerts: { id: string; kind: "DEVICE_BLOCKED" | "CODE_INVALID" | "ALREADY_REGISTERED"; at: string; studentName?: string; detail?: string }[] }
export interface PublicLinkInfoDto { state: "OFF" | "ACTIVE" | "EXPIRED"; registered?: { studentName: string; status: string; statusLabel: string; time?: string }; course: string; subject: string; institution: string; expiresAt?: string; serverTime: string }
export interface StudentSelfReportDto {
  student: { name: string; code: string; course?: string }; institution: string; generatedAt: string;
  attendance: { classes: number; present: number; late: number; absent: number; justified: number; percent?: number };
  history: { date: string; subject: string; status: string; statusLabel: string; time?: string }[];
  grades: { average?: number; performance?: string; periods: { name: string; average: number; performance?: string }[]; assessments: { period: string; subject: string; name: string; value: number; feedback?: string }[] };
}
export interface ObservationDto { id: string; studentId: string; studentName?: string; type: string; description: string; priority: "LOW" | "NORMAL" | "HIGH"; followUp?: string; status: "OPEN" | "IN_PROGRESS" | "CLOSED"; observedAt: string }
async function getAllStudents(status: "ACTIVO" | "TODOS" = "ACTIVO"): Promise<PaginatedResult<StudentDto>> {
  const items: StudentDto[] = [];
  let latest: PaginatedResult<StudentDto> | undefined;
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({ page: String(page), pageSize: "100", status });
    latest = await request<PaginatedResult<StudentDto>>(`/api/students?${query}`);
    items.push(...latest.items);
    if (page >= latest.totalPages) return { ...latest, items, page: 1, pageSize: items.length, totalPages: items.length ? 1 : 0 };
  }
  throw new ApiClientError(400, "RESULT_LIMIT", "La consulta supera el límite de 10 000 perfiles. Refina los filtros o consulta la lista paginada.");
}
const json = (method: string, value?: unknown): RequestInit => ({ method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
export const api = {
  getStudentSelfReport: (input: { code?: string; tokenHash?: string }) => request<StudentSelfReportDto>("/api/public/student-report", json("POST", input)),
  getMe: () => request<AuthState>("/api/auth/me"),
  getPlatformOverview: () => request<PlatformOverviewDto>("/api/platform/overview"),
  login: (input: { email: string; password: string }) => request<{ ok: true }>("/api/auth/login", json("POST", input)),
  register: (input: { name: string; email: string; password: string; accountType: "PERSONAL" | "INSTITUTION" }) => request<{ ok: true }>("/api/auth/register", json("POST", input)),
  logout: () => request<void>("/api/auth/logout", json("POST")),
  getStudents: (query = "") => request<PaginatedResult<StudentDto>>(`/api/students${query}`), getAllStudents, getStudent: (id: string) => request<{ item: StudentDto }>(`/api/students/${id}`),
  downloadStudentQrs: (format: "pdf" | "zip") => download(`/api/students/qr-export?format=${format}`),
  downloadImportTemplate: (format: "csv" | "xlsx") => download(`/api/learning/imports/templates?kind=students&format=${format}`),
  createStudent: (input: StudentInput) => request<{ student: StudentDto; qr: QrDelivery }>("/api/students", json("POST", input)), updateStudent: (id: string, input: Partial<StudentInput>) => request<{ item: StudentDto }>(`/api/students/${id}`, json("PATCH", input)), deactivateStudent: (id: string) => request<{ item: StudentDto }>(`/api/students/${id}/deactivate`, json("POST")), reactivateStudent: (id: string) => request<{ item: StudentDto }>(`/api/students/${id}/reactivate`, json("POST")),
  getStudentQrStatus: (id: string) => request<{ qrVersion: number; requiresRegeneration: boolean; message: string }>(`/api/students/${id}/qr`), regenerateStudentQr: (id: string) => request<{ student: StudentDto; qr: QrDelivery }>(`/api/students/${id}/qr/regenerate`, json("POST")),
  getCourseGroups: () => request<{ items: CourseGroupDto[] }>("/api/course-groups"), createCourseGroup: (input: Pick<CourseGroupDto, "grade" | "group" | "academicYear">) => request<{ item: CourseGroupDto }>("/api/course-groups", json("POST", input)),
  seedDevelopmentData: () => request<{ created: number; courseGroups: number; totalFixtures: number }>("/api/development/seed", json("POST")),
  getSubjects: () => request<{ items: SubjectDto[] }>("/api/learning/subjects"), createSubject: (input: { name: string; code?: string; courseGroupIds: string[] }) => request<{ item: SubjectDto }>("/api/learning/subjects", json("POST", input)),
  getPeriods: () => request<{ items: PeriodDto[] }>("/api/learning/periods"), createPeriod: (input: PeriodInput) => request<{ item: PeriodDto }>("/api/learning/periods", json("POST", input)),
  getSchedules: () => request<{ items: ScheduleDto[] }>("/api/learning/schedules"), createSchedule: (input: Omit<ScheduleDto, "id" | "timezone" | "active" | "teacherUserId"> & { teacherUserId?: string }) => request<{ item: ScheduleDto }>("/api/learning/schedules", json("POST", input)), updateSchedule: (id: string, input: Partial<Omit<ScheduleDto, "id" | "timezone" | "active">>) => request<{ item: ScheduleDto }>(`/api/learning/schedules/${id}`, json("PATCH", input)), deactivateSchedule: (id: string) => request<{ item: { id: string; active: boolean } }>(`/api/learning/schedules/${id}`, { method: "DELETE" }),
  getInstitutionSettings: () => request<{ item: { id: string; name: string; timezone: string } }>("/api/learning/institution/settings"), updateInstitutionSettings: (input: { name?: string; timezone?: string }) => request<{ item: { id: string; name: string; timezone: string } }>("/api/learning/institution/settings", json("PATCH", input)),
  getAttendanceContext: () => request<{ timezone: string; queueScope: string; groups: { id: string; label: string; academicYear: number }[]; subjects: { id: string; name: string; courseGroupIds: string[] }[]; schedules: ScheduleDto[] }>("/api/learning/attendance/context"),
  getSessions: (date?: string) => request<{ items: SessionDto[] }>(`/api/learning/attendance/sessions${date ? `?date=${encodeURIComponent(date)}` : ""}`), createSession: (scheduleId: string, dateKey: string) => request<{ item: SessionDto }>("/api/learning/attendance/sessions", json("POST", { scheduleId, dateKey })),
  getRoster: (sessionId: string) => request<{ session: { id: string; state: string; startsAt: string; endsAt: string; scheduledStartsAt?: string; toleranceMinutes?: number }; items: RosterLine[]; summary: { total: number; present: number; late: number; absent: number; justified: number; pending: number } }>(`/api/learning/attendance/sessions/${sessionId}`),
  scanQr: (sessionId: string, input: { tokenHash: string; clientEventId?: string; deviceScannedAt?: string }) => request<{ duplicate: boolean; message: string; item: Partial<RosterLine> }>(`/api/learning/attendance/sessions/${sessionId}/scan`, json("POST", input)),
  markAttendance: (sessionId: string, input: { studentId: string; status: "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED"; reason?: string }) => request<{ item: Partial<RosterLine> }>(`/api/learning/attendance/sessions/${sessionId}/mark`, json("POST", input)), getAttendanceLink: (sessionId: string) => request<{ item: AttendanceLinkDto }>(`/api/learning/attendance/sessions/${sessionId}/link`),
  openAttendanceLink: (sessionId: string, input: { minutes: number; autoClose: boolean }) => request<{ item: AttendanceLinkDto }>(`/api/learning/attendance/sessions/${sessionId}/link`, json("POST", input)),
  closeAttendanceLink: (sessionId: string) => request<{ item: AttendanceLinkDto }>(`/api/learning/attendance/sessions/${sessionId}/link`, { method: "DELETE" }),
  getPublicLink: (token: string) => request<PublicLinkInfoDto>(`/api/public/attendance/${encodeURIComponent(token)}`),
  registerWithCode: (token: string, code: string) => request<{ studentName: string; status: string; statusLabel: string; time: string }>(`/api/public/attendance/${encodeURIComponent(token)}`, json("POST", { code })),
  deleteStudent: (id: string) => request<{ deleted: number }>(`/api/students/${id}`, { method: "DELETE" }),
  deleteCourse: (id: string) => request<{ deletedStudents: number }>(`/api/course-groups/${id}`, { method: "DELETE" }),
  deleteEverything: (confirmation: string) => request<{ deletedStudents: number; deletedCourses: number }>("/api/students/delete-all", json("POST", { confirmation })),
  adjustSession: (sessionId: string, input: { startNow?: boolean; toleranceMinutes: number }) => request<{ item: SessionDto }>(`/api/learning/attendance/sessions/${sessionId}/adjust`, json("POST", input)), closeSession: (sessionId: string) => request<{ item: { id: string; state: string; absencesCreated: number } }>(`/api/learning/attendance/sessions/${sessionId}/close`, json("POST")),
  getGradeSetup: (periodId?: string, subjectId?: string) => request<{ categories: GradeCategoryDto[]; assessments: AssessmentDto[] }>(`/api/learning/grades/setup${periodId || subjectId ? `?${new URLSearchParams({ ...(periodId ? { periodId } : {}), ...(subjectId ? { subjectId } : {}) })}` : ""}`),
  createCategory: (input: { periodId: string; subjectId: string; name: string; weightPercent: number }) => request<{ item: GradeCategoryDto }>("/api/learning/grades/categories", json("POST", input)),
  createAssessment: (input: { periodId: string; subjectId: string; categoryId?: string; name: string; weightPercent: number; dueAt?: string }) => request<{ item: AssessmentDto }>("/api/learning/grades/assessments", json("POST", input)),
  updateAssessment: (id: string, input: { name?: string; weightPercent?: number }) => request<{ item: { id: string; name: string; weightPercent: number } }>(`/api/learning/grades/assessments/${id}`, json("PATCH", input)),
  deleteAssessment: (id: string) => request<{ item: { id: string } }>(`/api/learning/grades/assessments/${id}`, { method: "DELETE" }),
  setGradingMode: (input: { periodId: string; subjectId: string; mode: GradingMode }) => request<{ item: { mode: GradingMode } }>("/api/learning/grades/mode", json("PUT", input)),
  getGrades: (filters: Record<string, string>) => request<{ items: GradeRowDto[] }>(`/api/learning/grades?${new URLSearchParams(filters)}`), saveGrade: (input: { studentId: string; assessmentId: string; value: number; feedback?: string }) => request<{ item: { id: string; value: number } }>("/api/learning/grades", json("PUT", input)),
  getScheduleBreaks: () => request<{ items: ScheduleBreakDto[] }>("/api/learning/schedules/breaks"),
  createScheduleBreak: (input: Omit<ScheduleBreakDto, "id">) => request<{ item: ScheduleBreakDto }>("/api/learning/schedules/breaks", json("POST", input)),
  deleteScheduleBreak: (id: string) => request<{ item: { id: string } }>(`/api/learning/schedules/breaks/${id}`, { method: "DELETE" }),
  getObservations: (studentId?: string) => request<{ items: ObservationDto[] }>(`/api/learning/observations${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`), createObservation: (input: { studentId: string; type: string; description: string; priority: "LOW" | "NORMAL" | "HIGH"; followUp?: string }) => request<{ item: ObservationDto }>("/api/learning/observations", json("POST", input)), updateObservation: (id: string, input: { status: "OPEN" | "IN_PROGRESS" | "CLOSED"; followUp?: string }) => request<{ item: { id: string; status: string } }>(`/api/learning/observations/${id}`, json("PATCH", input)),
  previewImport: (file: File) => { const data = new FormData(); data.append("file", file); return request<ImportPreviewDto>(`/api/learning/imports/students/preview`, { method: "POST", body: data }); }, remapImport: (id: string, mapping: Record<string, string>) => request<ImportPreviewDto>(`/api/learning/imports/${id}/remap`, json("POST", { mapping })), confirmImport: (id: string) => request<{ created: number; summary: ImportPreviewDto["summary"]; errors: ImportPreviewDto["errors"]; message: string }>(`/api/learning/imports/${id}/confirm`, json("POST")),
  getAnalytics: (filters: Record<string, string>) => request<AnalyticsDto>(`/api/learning/analytics${Object.keys(filters).length ? `?${new URLSearchParams(filters)}` : ""}`), getAnalyticsThresholds: () => request<{ item: AnalyticsThresholds }>("/api/learning/analytics/settings"), saveAnalyticsThresholds: (input: AnalyticsThresholds) => request<{ item: AnalyticsThresholds }>("/api/learning/analytics/settings", json("PUT", input)),
  getStudentReport: (studentId: string, filters: Record<string, string>) => request<StudentReportDto>(`/api/learning/reports/students/${studentId}${Object.keys(filters).length ? `?${new URLSearchParams(filters)}` : ""}`),
  getCourseGradesReport: (courseId: string, periodId?: string) => request<CourseGradesReportDto>(`/api/learning/reports/courses/${courseId}/grades${periodId ? `?periodId=${periodId}` : ""}`),
  async downloadReport(studentId: string, filters: Record<string, string>) { const query = new URLSearchParams(filters); return download(`/api/learning/reports/students/${studentId}.pdf${query.size ? `?${query}` : ""}`); },
  getAudit: () => request<{ items: { id: string; actor: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; at?: string }[] }>("/api/learning/audit"), getMemberships: () => request<{ items: { id: string; userId: string; name: string; email?: string; role: "ADMIN" | "DOCENTE"; courseGroupIds: string[] }[] }>("/api/learning/memberships"), updateMembership: (id: string, input: { role: "ADMIN" | "DOCENTE"; courseGroupIds: string[] }) => request<{ item: { id: string; role: "ADMIN" | "DOCENTE"; courseGroupIds: string[] } }>(`/api/learning/memberships/${id}`, json("PATCH", input)), revokeMembership: (id: string) => request<{ ok: boolean }>(`/api/learning/memberships/${id}`, { method: "DELETE" }), getInvitations: () => request<{ items: { id: string; email: string; role: "ADMIN" | "DOCENTE"; courseGroupIds: string[]; expiresAt: string }[] }>("/api/learning/invitations"), createInvitation: (input: { email: string; role: "ADMIN" | "DOCENTE"; courseGroupIds: string[] }) => request<{ status: string; message: string }>("/api/learning/invitations", json("POST", input)), revokeInvitation: (id: string) => request<{ ok: boolean }>(`/api/learning/invitations/${id}`, { method: "DELETE" }), downloadBackup: () => download("/api/learning/backup"),
};
