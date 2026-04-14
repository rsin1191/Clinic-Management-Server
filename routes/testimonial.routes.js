import express from "express";
import auth from "../middlewares/auth.middleware.js";
import {
  createOrUpdateTestimonial,
  getTestimonialsForDoctor,
  updateTestimonial
} from "../controllers/testimonial.controller.js";

const router = express.Router();

// GET /api/testimonials/:doctorId
router.get("/:doctorId", getTestimonialsForDoctor);

// POST /api/testimonials  (authenticated patient)
router.post("/", auth, createOrUpdateTestimonial);

// PUT /api/testimonials/:id  (owner only)
router.put("/:id", auth, updateTestimonial);

export default router;