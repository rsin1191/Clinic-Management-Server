// routes/appointmentRoutes.js
import express from "express";
import {
  createAppointment,
  listAppointments,
  getAppointmentById,
  updateAppointment,
  confirmAppointment,
  cancelAppointment,
  deleteAppointment,
  getMyScheduledAppointmentsAsDoctor,
  getMyPastAppointmentsAsPatient
} from "../controllers/appointment.js";



// Optional middleware imports (add later if you have auth)
import auth from "../middlewares/auth.middleware.js";
// import { isDoctorOrAdmin, isAdmin } from "../middlewares/rbac.js";

const router = express.Router();

router.get("/my-schedule", auth, getMyScheduledAppointmentsAsDoctor);
router.get("/my-past", auth, getMyPastAppointmentsAsPatient);
router.post("/", createAppointment);
router.get("/", listAppointments);
router.get("/:id", getAppointmentById);
router.put("/:id", updateAppointment);
router.post("/:id/confirm", confirmAppointment);
router.post("/:id/cancel", auth, cancelAppointment);
router.delete("/:id", deleteAppointment);


export default router;
