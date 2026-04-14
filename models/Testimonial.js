import mongoose from "mongoose";

const TestimonialSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    comment: {
      type: String,
      required: true,
      trim: true
    }
  },
  { timestamps: true }
);

// A patient can only leave one testimonial per doctor
TestimonialSchema.index({ doctorId: 1, patientId: 1 }, { unique: true });

export default mongoose.model("Testimonial", TestimonialSchema);