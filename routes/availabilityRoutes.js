// routes/availabilityRoutes.js
import express from "express";
import {
  upsertAvailability,
  patchAvailability,
  deleteAvailability,
  getAvailability,
  listAvailability,
  getAvailableSlots
} from "../controllers/availabilityController.js";

const router = express.Router();

router.get("/", listAvailability);
router.get("/:doctorId", getAvailability);
router.put("/:doctorId", upsertAvailability);
router.patch("/:doctorId", patchAvailability);
router.delete("/:doctorId", deleteAvailability);
router.get("/:doctorId/slots", getAvailableSlots);

export default router;
