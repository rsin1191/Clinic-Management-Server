// models/Appointment.js
import mongoose from "mongoose";
import crypto from "crypto";

const AppointmentSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctorId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // store all times in UTC
    date:      { type: Date, required: true }, // midnight UTC of the day
    startTime: { type: Date, required: true, index: true },
    endTime:   { type: Date, required: true },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "confirmed",
      index: true
    },

    notes: { type: String },

    confirmationCode: {
      type: String,
      default: () => crypto.randomBytes(4).toString("hex").toUpperCase(), // e.g. "9F1C3B7A"
      index: true
    },

    cancellationReason: { type: String }
  },
  { timestamps: true }
);

// Basic index to help find doctor’s appointments in a range
AppointmentSchema.index({ doctorId: 1, startTime: 1 });
// Optional: speed up day lookups
AppointmentSchema.index({ doctorId: 1, date: 1 });

export default mongoose.model("Appointment", AppointmentSchema);
