import "dotenv/config";
import { connectToDatabase, disconnectFromDatabase } from "../server/src/config/database.js";
import { AuditLog, BootstrapState, Complaint, CourseGroup, Enrollment, Institution, Membership, MembershipInvitation, Student, User } from "../server/src/models/index.js";
import { AcademicPeriod, Assessment, Attendance, AttendanceLinkEvent, ClassSession, Grade, GradeCategory, ImportJob, LearningResource, Observation, Schedule, ScheduleBreak, Subject } from "../server/src/models/learning.js";
async function main(): Promise<void> {
  await connectToDatabase();
  const userIndexes = await User.collection.indexes();
  for (const index of userIndexes) {
    if (index.name === "manusOpenId_1") {
      await User.collection.dropIndex(index.name);
      console.info("Índice legado eliminado: manusOpenId_1");
    }
  }
  const models = [Complaint, Institution, User, BootstrapState, Membership, MembershipInvitation, CourseGroup, Enrollment, Student, AuditLog, Subject, AcademicPeriod, GradeCategory, Assessment, Grade, Schedule, ScheduleBreak, AttendanceLinkEvent, ClassSession, Attendance, Observation, LearningResource, ImportJob];
  for (const currentModel of models) { await currentModel.createCollection().catch(() => undefined); await currentModel.createIndexes(); const indexes = await currentModel.collection.indexes(); console.info(`${currentModel.modelName}: ${indexes.map((index) => index.name).join(", ")}`); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => disconnectFromDatabase());
