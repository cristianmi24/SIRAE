export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED" | "PENDING_REVIEW";
export type AttendanceSource = "QR" | "MANUAL" | "OFFLINE" | "SESSION_CLOSE";
export interface SubjectDto { id: string; name: string; code?: string; active: boolean }
export interface PeriodDto { id: string; name: string; startsOn: string; endsOn: string; active: boolean; scale: { min: number; max: number; bands: { label: string; min: number; max: number }[] } }
export interface ScheduleDto { id: string; courseGroupId: string; subjectId: string; teacherUserId: string; weekdays: number[]; startTime: string; endTime: string; toleranceMinutes: number; timezone: string; active: boolean }
export interface SessionDto { id: string; scheduleId: string; courseGroupId: string; subjectId: string; dateKey: string; startsAt: string; endsAt: string; timezone: string; state: "OPEN" | "CLOSED" }
export interface AttendanceDto { id: string; studentId: string; studentName: string; document: string; status: AttendanceStatus; recordedAt?: string; source: AttendanceSource; requiresReview: boolean; reason?: string }
