import mongoose from "mongoose";
import Testimonial from "../models/Testimonial.js";
import User from "../models/user.model.js";

const isOid = (id) => mongoose.Types.ObjectId.isValid(id);

// CREATE OR UPDATE testimonial by same patient
export const createOrUpdateTestimonial = async (req, res) => {
  try {
    const patientId = req.user?.id || req.user?._id;
    const { doctorId, rating, comment } = req.body;

    if (!patientId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!doctorId || !isOid(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctorId" });
    }

    // doctor must be a DOCTOR user
    const doctor = await User.findById(doctorId).select("role");
    if (!doctor || doctor.role !== "DOCTOR") {
      return res.status(400).json({ success: false, message: "Not a doctor" });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be 1–5" });
    }

    if (typeof comment !== "string" || comment.trim().length < 1) {
      return res.status(400).json({ success: false, message: "Comment is required" });
    }

    // upsert ensures unique patient-doctor testimonial
    const testimonial = await Testimonial.findOneAndUpdate(
      { doctorId, patientId },
      { doctorId, patientId, rating, comment },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Testimonial saved",
      testimonial
    });
  } catch (e) {
    console.error("Testimonial save error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// LIST testimonials for a doctor
export const getTestimonialsForDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!doctorId || !isOid(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctorId" });
    }

    const testimonials = await Testimonial.find({ doctorId })
      .populate("patientId", "firstName lastName")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: testimonials.length,
      testimonials
    });
  } catch (e) {
    console.error("Get testimonials error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// EDIT testimonial (only by owner)
export const updateTestimonial = async (req, res) => {
  try {
    const patientId = req.user?.id || req.user?._id;
    const { id } = req.params;

    if (!isOid(id)) {
      return res.status(400).json({ success: false, message: "Invalid testimonial id" });
    }

    const testimonial = await Testimonial.findById(id);
    if (!testimonial) {
      return res.status(404).json({ success: false, message: "Testimonial not found" });
    }

    if (testimonial.patientId.toString() !== patientId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const { rating, comment } = req.body;

    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: "Rating must be 1–5" });
      }
      testimonial.rating = rating;
    }

    if (comment !== undefined) {
      if (typeof comment !== "string" || !comment.trim()) {
        return res.status(400).json({ success: false, message: "Comment cannot be empty" });
      }
      testimonial.comment = comment;
    }

    await testimonial.save();

    return res.status(200).json({
      success: true,
      message: "Testimonial updated",
      testimonial
    });
  } catch (e) {
    console.error("Update testimonial error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};