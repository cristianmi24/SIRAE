import "dotenv/config";
import { connectToDatabase, disconnectFromDatabase } from "../server/src/config/database.js";
import { Institution, Membership, User } from "../server/src/models/index.js";
import { seedDevelopmentData } from "../server/src/services/development-seed.js";

async function main(): Promise<void> {
  await connectToDatabase();
  const membership = await Membership.findOne({ active: true }).sort({ createdAt: 1 });
  if (!membership) {
    throw new Error("No existe una membresía activa. Inicia sesión una vez en AulaNexo antes de sembrar datos ficticios.");
  }
  const [user, institution] = await Promise.all([
    User.findById(membership.userId),
    Institution.findById(membership.institutionId),
  ]);
  if (!user || !institution) {
    throw new Error("La membresía inicial no tiene usuario o institución válidos.");
  }
  const result = await seedDevelopmentData({
    identity: { authId: user.authId, name: user.displayName, email: user.email },
    user: { id: user._id.toString(), name: user.displayName, email: user.email },
    membership: { id: membership._id.toString(), role: membership.role, courseGroupIds: membership.courseGroupIds.map((id) => id.toString()) },
    institution: { id: institution._id.toString(), name: institution.name, timezone: institution.timezone },
  });
  console.info(`Datos ficticios listos: ${result.created} estudiantes creados; ${result.courseGroups} grupos asegurados.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => disconnectFromDatabase());
