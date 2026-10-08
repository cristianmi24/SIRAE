import { Router } from "express";
import { requireAuthContext, requireRole } from "../middleware/security.js";
import { seedDevelopmentData } from "../services/development-seed.js";

export const developmentRouter = Router();

developmentRouter.post("/seed", requireRole("ADMIN"), async (request, response, next) => {
  try {
    response.json(await seedDevelopmentData(requireAuthContext(request)));
  } catch (error) {
    next(error);
  }
});
