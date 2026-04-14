import mongoose from "mongoose";
import Appointment from "../models/Appointment.js";
import Availability from "../models/Availability.js";

const isOid = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================
   Interval helpers (UTC)
   All intervals half-open [start, end)
========================= */
function subtractWindows(freeWindows, busyWindows) {
  const out = [];
  for (const fw of freeWindows) {
    let segs = [{ start: new Date(fw.start), end: new Date(fw.end) }];
    for (const bw of busyWindows) {
      const next = [];
      const BS = new Date(bw.start).getTime();
      const BE = new Date(bw.end).getTime();
      for (const s of segs) {
        const S = s.start.getTime();
        const E = s.end.getTime();
        if (BE <= S || BS >= E) { next.push(s); continue; }
        if (BS > S) next.push({ start: s.start, end: new Date(BS) });
        if (BE < E) next.push({ start: new Date(BE), end: s.end });
      }
      segs = next;
      if (!segs.length) break;
    }
    out.push(...segs);
  }
  return out;
}

function sameDayUtc(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function buildCandidateWindowsForDay(availDoc, dayStartUtc) {
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24*60*60*1000);
  const out = [];
  const dow = dayStartUtc.getUTCDay();

  // weekly
  for (const w of availDoc.weekly || []) {
    if (w.dayOfWeek !== dow) continue;
    const ws = new Date(dayStartUtc.getTime() + w.startMinute * 60000);
    const we = new Date(dayStartUtc.getTime() + w.endMinute   * 60000);
    if (we > ws) out.push({ start: ws, end: we });
  }
  // date windows intersecting the day
  for (const w of availDoc.dateWindows || []) {
    const s = new Date(Math.max(new Date(w.start).getTime(), dayStartUtc.getTime()));
    const e = new Date(Math.min(new Date(w.end).getTime(),   dayEndUtc.getTime()));
    if (e > s) out.push({ start: s, end: e });
  }
  return out;
}

function expandByBuffer(win, bufferMs) {
  if (!bufferMs) return win;
  return {
    start: new Date(new Date(win.start).getTime() - bufferMs),
    end:   new Date(new Date(win.end).getTime()   + bufferMs),
  };
}

/* =========================
   Core guards
========================= */

// Throws response (returns object) if not allowed; returns { ok: true } if allowed
async function guardOverlapAndAvailability({ doctorId, start, end }) {
  // 1) Overlap against existing (pending/confirmed)
  const conflict = await Appointment.findOne({
    doctorId,
    startTime: { $lt: end },
    endTime:   { $gt: start },
    status: { $in: ["pending", "confirmed"] },
  }).select("_id");
  if (conflict) {
    return { ok: false, status: 409, body: { success: false, message: "Time slot already booked for this doctor" } };
  }

  // 2) Availability
  const avail = await Availability.findOne({ doctorId });
  if (!avail) {
    return { ok: false, status: 400, body: { success: false, message: "Doctor has no availability configured" } };
  }

  const dayStart = sameDayUtc(start);
  const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const candidate = buildCandidateWindowsForDay(avail, dayStart);

  // busy = blackouts intersecting that day + existing appts that day
  const busy = [];

  for (const w of avail.blackoutWindows || []) {
    const s = new Date(Math.max(new Date(w.start).getTime(), dayStart.getTime()));
    const e = new Date(Math.min(new Date(w.end).getTime(),   dayEnd.getTime()));
    if (e > s) busy.push({ start: s, end: e });
  }

  const dayAppts = await Appointment.find({
    doctorId, startTime: { $lt: dayEnd }, endTime: { $gt: dayStart },
    status: { $in: ["pending", "confirmed"] },
  }).select("startTime endTime");

  const bufferMs = Math.max(0, Math.min((avail.bufferMinutes || 0) * 60000, 120 * 60000));
  for (const a of dayAppts) busy.push(expandByBuffer({ start: a.startTime, end: a.endTime }, bufferMs));

  const freeWindows = subtractWindows(candidate, busy);

  const requested = expandByBuffer({ start, end }, bufferMs);
  const fits = freeWindows.some(w => w.start <= requested.start && w.end >= requested.end);

  if (!fits) {
    return { ok: false, status: 400, body: { success: false, message: "Requested time is outside doctor's available windows" } };
  }

  return { ok: true };
}

/* =========================
   Controllers
========================= */

// CREATE
export const createAppointment = async (req, res) => {
  try {
    const {
      patientId,
      doctorId,
      date,         // optional; derived from startTime if missing
      startTime,
      endTime,
      status,       // optional; defaults in schema
      notes,        // optional
      confirmationCode,
      cancellationReason,
    } = req.body;

    if (!patientId || !doctorId || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: "patientId, doctorId, startTime, and endTime are required" });
    }
    if (!isOid(patientId) || !isOid(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid patientId or doctorId" });
    }

    const start = new Date(startTime);
    const end   = new Date(endTime);
    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ success: false, message: "Invalid startTime or endTime" });
    }
    if (end <= start) {
      return res.status(400).json({ success: false, message: "endTime must be after startTime" });
    }

    const apptDate = date
      ? new Date(date)
      : sameDayUtc(start);
    if (isNaN(apptDate)) {
      return res.status(400).json({ success: false, message: "Invalid date" });
    }

    // Enforce overlap + availability
    const guard = await guardOverlapAndAvailability({ doctorId, start, end });
    if (!guard.ok) return res.status(guard.status).json(guard.body);

    const appt = await Appointment.create({
      patientId,
      doctorId,
      date: apptDate,
      startTime: start,
      endTime: end,
      status,
      notes,
      confirmationCode,
      cancellationReason,
    });

    return res.status(201).json({ success: true, message: "Appointment created", appointment: appt });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ success: false, message: "Time slot already booked for this doctor", details: e.keyValue });
    }
    if (e.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v.message])),
      });
    }
    console.error("Create appointment error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// LIST (with filters & pagination)
// Optional query: populate=doctor,patient
export const listAppointments = async (req, res) => {
  try {
    const {
      doctorId, patientId, status,
      from, to,
      page = 1, limit = 20, sort = "startTime",
      populate // "doctor,patient"
    } = req.query;

    const q = {};
    if (doctorId) {
      if (!isOid(doctorId)) return res.status(400).json({ success: false, message: "Invalid doctorId" });
      q.doctorId = doctorId;
    }
    if (patientId) {
      if (!isOid(patientId)) return res.status(400).json({ success: false, message: "Invalid patientId" });
      q.patientId = patientId;
    }
    if (status) q.status = status;

    if (from || to) {
      q.startTime = {};
      if (from) {
        const f = new Date(from);
        if (isNaN(f)) return res.status(400).json({ success: false, message: "Invalid 'from' date" });
        q.startTime.$gte = f;
      }
      if (to) {
        const t = new Date(to);
        if (isNaN(t)) return res.status(400).json({ success: false, message: "Invalid 'to' date" });
        q.startTime.$lte = t;
      }
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    let query = Appointment.find(q).sort(sort).skip(skip).limit(limitNum).lean();

    if (populate) {
      const fields = String(populate).split(",").map(s => s.trim()).filter(Boolean);
      for (const f of fields) {
        if (f === "doctor") query = query.populate("doctorId", "firstName lastName specialty");
        if (f === "patient") query = query.populate("patientId", "firstName lastName");
      }
    }

    const [items, total] = await Promise.all([
      query,
      Appointment.countDocuments(q),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      items,
    });
  } catch (e) {
    console.error("List appointments error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// READ ONE
export const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ success: false, message: "Invalid appointment id" });

    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ success: false, message: "Appointment not found" });

    return res.status(200).json({ success: true, appointment: appt });
  } catch (e) {
    console.error("Get appointment error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// UPDATE / RESCHEDULE
// Allows changing startTime/endTime (and recomputes date), notes, status (limited)
export const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ success: false, message: "Invalid appointment id" });

    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ success: false, message: "Appointment not found" });

    const updates = {};
    const allowedStatus = ["pending", "confirmed", "cancelled", "completed"];

    // Reschedule?
    if (req.body.startTime || req.body.endTime) {
      const start = new Date(req.body.startTime ?? appt.startTime);
      const end   = new Date(req.body.endTime   ?? appt.endTime);
      if (isNaN(start) || isNaN(end) || end <= start) {
        return res.status(400).json({ success: false, message: "Invalid startTime/endTime" });
      }

      // Enforce availability/overlap for the (possibly) new window
      const guard = await guardOverlapAndAvailability({ doctorId: appt.doctorId, start, end });
      if (!guard.ok) return res.status(guard.status).json(guard.body);

      updates.startTime = start;
      updates.endTime = end;
      updates.date = sameDayUtc(start);
    }

    // Notes
    if (typeof req.body.notes === "string") updates.notes = req.body.notes;

    // Status changes (limited)
    if (req.body.status) {
      const s = String(req.body.status).toLowerCase();
      if (!allowedStatus.includes(s)) {
        return res.status(400).json({ success: false, message: "Invalid status value" });
      }
      // Simple example rules (tune as needed)
      if (appt.status === "completed" && s !== "completed") {
        return res.status(409).json({ success: false, message: "Completed appointments cannot change status" });
      }
      if (appt.status === "cancelled" && s !== "cancelled") {
        return res.status(409).json({ success: false, message: "Cancelled appointments cannot change status" });
      }
      updates.status = s;
    }

    // Cancellation reason (only if status cancelled)
    if (updates.status === "cancelled" && typeof req.body.cancellationReason === "string") {
      updates.cancellationReason = req.body.cancellationReason;
    }

    Object.assign(appt, updates);
    await appt.save();

    return res.status(200).json({ success: true, message: "Appointment updated", appointment: appt });
  } catch (e) {
    console.error("Update appointment error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// CONFIRM (simple status transition)
export const confirmAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ success: false, message: "Invalid appointment id" });

    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ success: false, message: "Appointment not found" });

    if (appt.status === "cancelled") {
      return res.status(409).json({ success: false, message: "Cancelled appointments cannot be confirmed" });
    }
    if (appt.status === "completed") {
      return res.status(409).json({ success: false, message: "Completed appointments cannot be confirmed" });
    }

    appt.status = "confirmed";
    await appt.save();

    return res.status(200).json({ success: true, message: "Appointment confirmed", appointment: appt });
  } catch (e) {
    console.error("Confirm appointment error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// CANCEL (idempotent; lowercase statuses)
export const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = req.body?.reason || "Cancelled by requester";

    if (!isOid(id)) return res.status(400).json({ success: false, message: "Invalid appointment id" });

    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ success: false, message: "Appointment not found" });

    if (appt.status === "completed") {
      return res.status(409).json({ success: false, message: "Completed appointments cannot be cancelled" });
    }

    if (appt.status === "cancelled") {
      return res.status(200).json({ success: true, message: "Appointment already cancelled", appointment: appt });
    }

    appt.status = "cancelled";
    appt.cancellationReason = reason;
    await appt.save();

    return res.status(200).json({ success: true, message: "Appointment cancelled", appointment: appt });
  } catch (e) {
    console.error("Cancel appointment error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// DELETE (admin or doctor-only)
export const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ success: false, message: "Invalid appointment id" });

    const deleted = await Appointment.findByIdAndDelete(id);
    // idempotent success
    return res.status(200).json({ success: true, deleted: !!deleted });
  } catch (e) {
    console.error("Delete appointment error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
// <--------------ERDEM------------------>
// DOCTOR – My scheduled (upcoming) appointments
// GET /api/appointments/my-schedule
export const getMyScheduledAppointmentsAsDoctor = async (req, res) => {
  try {
    const doctorId = req.user?.id || req.user?._id;

    if (!doctorId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    const now = new Date();

    const appointments = await Appointment.find({
      doctorId,
      startTime: { $gte: now },
      status: { $in: ["pending", "confirmed"] },
    })
      .populate({
        path: "patientId",
        // gömülü objeyi de getiriyoruz
        select: "firstName lastName email patientProfile",
      })
      .sort({ startTime: 1 });

    return res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error) {
    console.error("Error in getMyScheduledAppointmentsAsDoctor:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};


// PATIENT – My previous (past) appointments / history
// GET /api/appointments/my-history
export const getMyPastAppointmentsAsPatient = async (req, res) => {
  try {
    const patientId = req.user?.id || req.user?._id;

    if (!patientId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    const appointments = await Appointment.find({ patientId })
      .populate("doctorId") 
      .sort({ startTime: 1 });

    return res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error) {
    console.error("Error in getMyPastAppointmentsAsPatient:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};