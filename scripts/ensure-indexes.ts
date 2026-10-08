import "dotenv/config";
import { connectToDatabase, disconnectFromDatabase } from "../server/src/config/database.js";
import { AuditLog, CourseGroup, Enrollment, Institution, Membership, Student, User } from "../server/src/models/index.js";
import { AcademicPeriod, Assessment, Attendance, ClassSession, Grade, GradeCategory, ImportJob, LearningResource, Observation, Schedule, Subject } from "../server/src/models/learning.js";
async function main(): Promise<void> {
  await connectToDatabase();
  const userIndexes = await User.collection.indexes();
  for (const index of userIndexes) {
    if (index.name === "manusOpenId_1") {
      await User.collection.dropIndex(index.name);
      console.info("Índice legado eliminado: manusOpenId_1");
    }
  }
  const models = [Institution, User, Membership, CourseGroup, Enrollment, Student, AuditLog, Subject, AcademicPeriod, GradeCategory, Assessment, Grade, Schedule, ClassSession, Attendance, Observation, LearningResource, ImportJob];
  for (const currentModel of models) { await currentModel.createIndexes(); const indexes = await currentModel.collection.indexes(); console.info(`${currentModel.modelName}: ${indexes.map((index) => index.name).join(", ")}`); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => disconnectFromDatabase());
