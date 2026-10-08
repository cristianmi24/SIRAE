import { Router } from "express";
import {
  createCourseGroupController,
  createStudentController,
  deactivateStudentController,
  getStudentController,
  listCourseGroupsController,
  listStudentsController,
  reactivateStudentController,
  regenerateStudentQrController,
  studentQrStatusController,
  updateStudentController,
  exportStudentQrsController,
  deleteCourseController,
  deleteEverythingController,
  deleteStudentController,
} from "../controllers/academic.js";
import { requireRole } from "../middleware/security.js";

export const courseGroupRouter = Router();
courseGroupRouter.get("/", listCourseGroupsController);
courseGroupRouter.post("/", requireRole("ADMIN"), createCourseGroupController);
courseGroupRouter.delete("/:id", requireRole("ADMIN"), deleteCourseController);

export const studentRouter = Router();
studentRouter.get("/", listStudentsController);
studentRouter.get("/qr-export", exportStudentQrsController);
studentRouter.post("/delete-all", requireRole("ADMIN"), deleteEverythingController);
studentRouter.post("/", createStudentController);
studentRouter.get("/:id", getStudentController);
studentRouter.patch("/:id", updateStudentController);
studentRouter.post("/:id/deactivate", requireRole("ADMIN", "DOCENTE"), deactivateStudentController);
studentRouter.post("/:id/reactivate", requireRole("ADMIN", "DOCENTE"), reactivateStudentController);
studentRouter.delete("/:id", deleteStudentController);
studentRouter.get("/:id/qr", studentQrStatusController);
studentRouter.post("/:id/qr/regenerate", regenerateStudentQrController);
