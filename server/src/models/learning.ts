import mongoose, { model, Schema, type Model, type Types } from "mongoose";

const base = { timestamps: true, versionKey: false as const };
const oid = Schema.Types.ObjectId;

export interface SubjectRecord { institutionId: Types.ObjectId; name: string; code?: string; courseGroupIds: Types.ObjectId[]; active: boolean; createdBy: Types.ObjectId }
const subjectSchema = new Schema<SubjectRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, name: { type: String, required: true, trim: true, maxlength: 100 }, code: { type: String, trim: true, maxlength: 32 }, courseGroupIds: [{ type: oid, ref: "CourseGroup" }], active: { type: Boolean, default: true }, createdBy: { type: oid, ref: "User", required: true } }, base);
subjectSchema.index({ institutionId: 1, name: 1 }, { unique: true });

export interface PeriodRecord { institutionId: Types.ObjectId; name: string; startsOn: Date; endsOn: Date; active: boolean; scale: { min: number; max: number; bands: { label: string; min: number; max: number }[] }; createdBy: Types.ObjectId }
const periodSchema = new Schema<PeriodRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, name: { type: String, required: true, trim: true, maxlength: 80 }, startsOn: { type: Date, required: true }, endsOn: { type: Date, required: true }, active: { type: Boolean, default: true }, scale: { min: { type: Number, required: true, default: 0 }, max: { type: Number, required: true, default: 5 }, bands: [{ label: { type: String, required: true, trim: true, maxlength: 40 }, min: { type: Number, required: true }, max: { type: Number, required: true } }] }, createdBy: { type: oid, ref: "User", required: true } }, base);
periodSchema.index({ institutionId: 1, startsOn: 1, endsOn: 1 });

export type GradingMode = "WEIGHTED" | "AVERAGE";
export interface CategoryRecord { institutionId: Types.ObjectId; periodId: Types.ObjectId; subjectId: Types.ObjectId; name: string; weightPercent: number; mode?: GradingMode; active: boolean; createdBy: Types.ObjectId }
const categorySchema = new Schema<CategoryRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, periodId: { type: oid, ref: "AcademicPeriod", required: true }, subjectId: { type: oid, ref: "Subject", required: true }, name: { type: String, required: true, trim: true, maxlength: 80 }, weightPercent: { type: Number, required: true, min: 0, max: 100 }, mode: { type: String, enum: ["WEIGHTED", "AVERAGE"], default: "WEIGHTED" }, active: { type: Boolean, default: true }, createdBy: { type: oid, ref: "User", required: true } }, base);
categorySchema.index({ institutionId:  1, periodId: 1, subjectId: 1, name: 1 }, { unique: true });

export interface AssessmentRecord { institutionId: Types.ObjectId; periodId: Types.ObjectId; subjectId: Types.ObjectId; categoryId: Types.ObjectId; name: string; weightPercent: number; dueAt?: Date; active: boolean; createdBy: Types.ObjectId }
const assessmentSchema = new Schema<AssessmentRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, periodId: { type: oid, ref: "AcademicPeriod", required: true }, subjectId: { type: oid, ref: "Subject", required: true }, categoryId: { type: oid, ref: "GradeCategory", required: true }, name: { type: String, required: true, trim: true, maxlength: 120 }, weightPercent: { type: Number, required: true, min: 0, max: 100 }, dueAt: Date, active: { type: Boolean, default: true }, createdBy: { type: oid, ref: "User", required: true } }, base);
assessmentSchema.index({ institutionId: 1, periodId: 1, subjectId: 1, categoryId: 1, name: 1 }, { unique: true });

export interface GradeRecord { institutionId: Types.ObjectId; studentId: Types.ObjectId; assessmentId: Types.ObjectId; value: number; feedback?: string; gradedBy: Types.ObjectId; active: boolean }
const gradeSchema = new Schema<GradeRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, studentId: { type: oid, ref: "Student", required: true, index: true }, assessmentId: { type: oid, ref: "Assessment", required: true, index: true }, value: { type: Number, required: true }, feedback: { type: String, trim: true, maxlength: 2000 }, gradedBy: { type: oid, ref: "User", required: true }, active: { type: Boolean, default: true } }, base);
gradeSchema.index({ institutionId: 1, studentId: 1, assessmentId: 1 }, { unique: true });

export interface ScheduleRecord { institutionId: Types.ObjectId; courseGroupId: Types.ObjectId; subjectId: Types.ObjectId; teacherUserId: Types.ObjectId; weekdays: number[]; startTime: string; endTime: string; toleranceMinutes: number; timezone: string; active: boolean; createdBy: Types.ObjectId }
const scheduleSchema = new Schema<ScheduleRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, courseGroupId: { type: oid, ref: "CourseGroup", required: true, index: true }, subjectId: { type: oid, ref: "Subject", required: true, index: true }, teacherUserId: { type: oid, ref: "User", required: true, index: true }, weekdays: [{ type: Number, min: 1, max: 7 }], startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }, endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }, toleranceMinutes: { type: Number, required: true, min: 0, max: 180 }, timezone: { type: String, required: true, maxlength: 64 }, active: { type: Boolean, default: true }, createdBy: { type: oid, ref: "User", required: true } }, base);
scheduleSchema.index({ institutionId: 1, courseGroupId: 1, subjectId: 1, active: 1 });

// Descansos del horario (recreo, almuerzo…). Sin courseGroupId aplica a todos los cursos.
export interface ScheduleBreakRecord { institutionId: Types.ObjectId; courseGroupId?: Types.ObjectId; label: string; weekdays: number[]; startTime: string; endTime: string; active: boolean; createdBy: Types.ObjectId }
const scheduleBreakSchema = new Schema<ScheduleBreakRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, courseGroupId: { type: oid, ref: "CourseGroup", index: true }, label: { type: String, required: true, trim: true, maxlength: 60 }, weekdays: [{ type: Number, min: 1, max: 7 }], startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }, endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }, active: { type: Boolean, default: true }, createdBy: { type: oid, ref: "User", required: true } }, base);

export interface SessionRecord { institutionId: Types.ObjectId; scheduleId: Types.ObjectId; courseGroupId: Types.ObjectId; subjectId: Types.ObjectId; teacherUserId: Types.ObjectId; dateKey: string; startsAt: Date; endsAt: Date; timezone: string; state: "OPEN" | "CLOSED"; closedAt?: Date; createdBy: Types.ObjectId; scheduledStartsAt?: Date; scheduledEndsAt?: Date; toleranceMinutes?: number; adjustedAt?: Date; adjustedBy?: Types.ObjectId; linkToken?: string; linkOpensAt?: Date; linkExpiresAt?: Date; linkAutoClose?: boolean; linkClosedAt?: Date }
const sessionSchema = new Schema<SessionRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, scheduleId: { type: oid, ref: "Schedule", required: true }, courseGroupId: { type: oid, ref: "CourseGroup", required: true, index: true }, subjectId: { type: oid, ref: "Subject", required: true, index: true }, teacherUserId: { type: oid, ref: "User", required: true }, dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true }, timezone: { type: String, required: true }, state: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN" }, closedAt: Date, createdBy: { type: oid, ref: "User", required: true }, scheduledStartsAt: Date, scheduledEndsAt: Date, toleranceMinutes: { type: Number, min: 0, max: 180 }, adjustedAt: Date, adjustedBy: { type: oid, ref: "User" }, linkToken: { type: String, index: { unique: true, sparse: true } }, linkOpensAt: Date, linkExpiresAt: Date, linkAutoClose: Boolean, linkClosedAt: Date }, base);
sessionSchema.index({ institutionId: 1, scheduleId: 1, dateKey: 1 }, { unique: true });
sessionSchema.index({ institutionId: 1, courseGroupId: 1, startsAt: -1 });

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED" | "PENDING_REVIEW";
export interface AttendanceRecord { institutionId: Types.ObjectId; classSessionId: Types.ObjectId; studentId: Types.ObjectId; courseGroupId: Types.ObjectId; subjectId: Types.ObjectId; teacherUserId: Types.ObjectId; status: AttendanceStatus; recordedAt?: Date; source: "QR" | "MANUAL" | "OFFLINE" | "SESSION_CLOSE" | "LINK"; deviceScannedAt?: Date; requiresReview: boolean; reason?: string; clientEventId?: string; updatedBy: Types.ObjectId }
const attendanceSchema = new Schema<AttendanceRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, classSessionId: { type: oid, ref: "ClassSession", required: true, index: true }, studentId: { type: oid, ref: "Student", required: true, index: true }, courseGroupId: { type: oid, ref: "CourseGroup", required: true, index: true }, subjectId: { type: oid, ref: "Subject", required: true }, teacherUserId: { type: oid, ref: "User", required: true }, status: { type: String, enum: ["PRESENT", "LATE", "ABSENT", "JUSTIFIED", "PENDING_REVIEW"], required: true }, recordedAt: Date, source: { type: String, enum: ["QR", "MANUAL", "OFFLINE", "SESSION_CLOSE", "LINK"], required: true }, deviceScannedAt: Date, requiresReview: { type: Boolean, default: false }, reason: { type: String, trim: true, maxlength: 500 }, clientEventId: { type: String, trim: true, maxlength: 80 }, updatedBy: { type: oid, ref: "User", required: true } }, base);
attendanceSchema.index({ institutionId: 1, classSessionId: 1, studentId: 1 }, { unique: true });
attendanceSchema.index({ institutionId: 1, studentId: 1, recordedAt: -1 });
attendanceSchema.index({ institutionId: 1, courseGroupId: 1, recordedAt: -1 });
attendanceSchema.index({ institutionId: 1, clientEventId: 1 }, { unique: true, sparse: true });

export interface ObservationRecord { institutionId: Types.ObjectId; studentId: Types.ObjectId; type: string; description: string; teacherUserId: Types.ObjectId; priority: "LOW" | "NORMAL" | "HIGH"; followUp?: string; status: "OPEN" | "IN_PROGRESS" | "CLOSED"; observedAt: Date }
const observationSchema = new Schema<ObservationRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, studentId: { type: oid, ref: "Student", required: true, index: true }, type: { type: String, required: true, trim: true, maxlength: 64 }, description: { type: String, required: true, trim: true, maxlength: 3000 }, teacherUserId: { type: oid, ref: "User", required: true }, priority: { type: String, enum: ["LOW", "NORMAL", "HIGH"], default: "NORMAL" }, followUp: { type: String, trim: true, maxlength: 2000 }, status: { type: String, enum: ["OPEN", "IN_PROGRESS", "CLOSED"], default: "OPEN" }, observedAt: { type: Date, required: true, default: Date.now } }, base);
observationSchema.index({ institutionId: 1, studentId: 1, observedAt: -1 });

export interface ResourceRecord { institutionId: Types.ObjectId; name: string; description?: string; type: string; subjectId?: Types.ObjectId; courseGroupId?: Types.ObjectId; resourceDate: Date; link?: string; fileId?: Types.ObjectId; originalFilename?: string; mimeType?: string; sizeBytes?: number; tags: string[]; createdBy: Types.ObjectId; active: boolean }
const resourceSchema = new Schema<ResourceRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, name: { type: String, required: true, trim: true, maxlength: 160 }, description: { type: String, trim: true, maxlength: 2000 }, type: { type: String, required: true, trim: true, maxlength: 48 }, subjectId: { type: oid, ref: "Subject" }, courseGroupId: { type: oid, ref: "CourseGroup" }, resourceDate: { type: Date, required: true }, link: { type: String, trim: true, maxlength: 2048 }, fileId: oid, originalFilename: { type: String, trim: true, maxlength: 180 }, mimeType: { type: String, trim: true, maxlength: 100 }, sizeBytes: { type: Number, min: 0 }, tags: [{ type: String, trim: true, maxlength: 32 }], createdBy: { type: oid, ref: "User", required: true }, active: { type: Boolean, default: true } }, base);
resourceSchema.index({ institutionId: 1, active: 1, resourceDate: -1 });

export interface ImportJobRecord { institutionId: Types.ObjectId; createdBy: Types.ObjectId; kind: "students" | "resources"; state: "PREVIEW" | "CONFIRMED"; rows: Record<string, unknown>[]; summary: { found: number; valid: number; duplicates: number; errors: number }; rowErrors: { row: number; field: string; message: string }[]; headers: string[]; mapping: Record<string, string> }
const importJobSchema = new Schema<ImportJobRecord>({ institutionId: { type: oid, ref: "Institution", required: true, index: true }, createdBy: { type: oid, ref: "User", required: true }, kind: { type: String, enum: ["students", "resources"], required: true }, state: { type: String, enum: ["PREVIEW", "CONFIRMED"], default: "PREVIEW" }, rows: [{ type: Schema.Types.Mixed }], summary: { found: { type: Number, min: 0 }, valid: { type: Number, min: 0 }, duplicates: { type: Number, min: 0 }, errors: { type: Number, min: 0 } }, rowErrors: [{ row: Number, field: String, message: String }], headers: [String], mapping: { type: Schema.Types.Mixed, default: {} } }, base);
importJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

// Controles temporales del registro por código. Se borran solos (purgeAt) tras cerrar la jornada.
export interface AttendanceLinkEventRecord { institutionId: Types.ObjectId; classSessionId: Types.ObjectId; kind: "REGISTERED" | "DEVICE_BLOCKED" | "CODE_INVALID" | "ALREADY_REGISTERED"; deviceHash: string; studentId?: Types.ObjectId; detail?: string; at: Date; purgeAt: Date }
const attendanceLinkEventSchema = new Schema<AttendanceLinkEventRecord>({ institutionId: { type: oid, ref: "Institution", required: true }, classSessionId: { type: oid, ref: "ClassSession", required: true, index: true }, kind: { type: String, enum: ["REGISTERED", "DEVICE_BLOCKED", "CODE_INVALID", "ALREADY_REGISTERED"], required: true }, deviceHash: { type: String, required: true }, studentId: { type: oid, ref: "Student" }, detail: { type: String, maxlength: 200 }, at: { type: Date, required: true }, purgeAt: { type: Date, required: true } }, { versionKey: false });
attendanceLinkEventSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
attendanceLinkEventSchema.index({ classSessionId: 1, deviceHash: 1, kind: 1 });

function cached<T>(name: string, schema: Schema<T>): Model<T> { return (mongoose.models[name] as Model<T> | undefined) ?? model<T>(name, schema); }
export const Subject = cached("Subject", subjectSchema);
export const AcademicPeriod = cached("AcademicPeriod", periodSchema);
export const GradeCategory = cached("GradeCategory", categorySchema);
export const Assessment = cached("Assessment", assessmentSchema);
export const Grade = cached("Grade", gradeSchema);
export const Schedule = cached("Schedule", scheduleSchema);
export const ScheduleBreak = cached("ScheduleBreak", scheduleBreakSchema);
export const AttendanceLinkEvent = cached("AttendanceLinkEvent", attendanceLinkEventSchema);
export const ClassSession = cached("ClassSession", sessionSchema);
export const Attendance = cached("Attendance", attendanceSchema);
export const Observation = cached("Observation", observationSchema);
export const LearningResource = cached("LearningResource", resourceSchema);
export const ImportJob = cached("ImportJob", importJobSchema);
