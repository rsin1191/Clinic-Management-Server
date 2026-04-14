// models/Availability.js
import mongoose from "mongoose";

const TimeWindowSchema = new mongoose.Schema(
  {
    start: { type: Date, required: true }, // UTC
    end:   { type: Date, required: true }  // UTC (exclusive)
  },
  { _id: false }
);

const RecurringWindowSchema = new mongoose.Schema(
  {
    
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    
    startMinute: { type: Number, min: 0, max: 1440, required: true },
    endMinute:   { type: Number, min: 0, max: 1440, required: true }
  },
  { _id: false }
);

const AvailabilitySchema = new mongoose.Schema(
  {
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // One-off windows for specific dates
    dateWindows: [TimeWindowSchema],

    // Recurring weekly windows
    weekly: [RecurringWindowSchema],

    // Optional blackout periods (vacations, conferences)
    blackoutWindows: [TimeWindowSchema],

    slotSizeMinutes: { type: Number, default: 30, min: 5, max: 240 } // granularity
  },
  { timestamps: true }
);

AvailabilitySchema.index({ doctorId: 1 }, { unique: true });

export default mongoose.model("Availability", AvailabilitySchema);
