// controllers/availabilityController.js
import mongoose from "mongoose";
import Availability from "../models/Availability.js";
import Appointment from "../models/Appointment.js";

/* =========================
   Helpers
========================= */

const isOid = (id) => mongoose.Types.ObjectId.isValid(id);

// half-open intervals [start, end)
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

        // no overlap
        if (BE <= S || BS >= E) {
          next.push(s);
          continue;
        }
        // overlap -> split into up to two pieces
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

function splitIntoSlots(start, end, slotSizeMinutes) {
  const ms = slotSizeMinutes * 60 * 1000;
  const slots = [];
  for (let t = start.getTime(); t + ms <= end.getTime(); t += ms) {
    slots.push({ start: new Date(t), end: new Date(t + ms) });
  }
  return slots;
}

function clampWindow(win, fromDate, toDate) {
  const s = new Date(Math.max(new Date(win.start).getTime(), fromDate.getTime()));
  const e = new Date(Math.min(new Date(win.end).getTime(), toDate.getTime()));
  return e > s ? { start: s, end: e } : null;
}

function expandWindowByBuffer(win, bufferMs) {
  return {
    start: new Date(new Date(win.start).getTime() - bufferMs),
    end: new Date(new Date(win.end).getTime() + bufferMs),
  };
}

function validateWeekly(weekly) {
  if (!Array.isArray(weekly)) return true;
  return weekly.every(
    (w) =>
      Number.isInteger(w.dayOfWeek) &&
      w.dayOfWeek >= 0 &&
      w.dayOfWeek <= 6 &&
      Number.isInteger(w.startMinute) &&
      Number.isInteger(w.endMinute) &&
      w.startMinute >= 0 &&
      w.endMinute <= 1440 &&
      w.endMinute > w.startMinute
  );
}

function validateWindows(arr) {
  if (!Array.isArray(arr)) return true;
  return arr.every((w) => {
    const s = new Date(w.start);
    const e = new Date(w.end);
    return s instanceof Date && !isNaN(s) && e instanceof Date && !isNaN(e) && e > s;
  });
}

/* Build candidate free windows in [from,to) by
   - expanding weekly into day windows
   - including dateWindows
   All in UTC and clipped to [from,to).
*/
function buildCandidateWindows(availability, fromDate, toDate) {
  const dayMs = 24 * 60 * 60 * 1000;
  const out = [];

  // weekly recurring windows
  for (let t = fromDate.getTime(); t < toDate.getTime(); t += dayMs) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    const zero = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    for (const w of availability.weekly || []) {
      if (w.dayOfWeek !== dow) continue;
      const ws = new Date(zero.getTime() + w.startMinute * 60000);
      const we = new Date(zero.getTime() + w.endMinute * 60000);
      const clipped = clampWindow({ start: ws, end: we }, fromDate, toDate);
      if (clipped) out.push(clipped);
    }
  }

  // one-off date windows
  for (const w of availability.dateWindows || []) {
    const clipped = clampWindow({ start: w.start, end: w.end }, fromDate, toDate);
    if (clipped) out.push(clipped);
  }

  return out;
}

/* =========================
   Controllers
========================= */

// Create or replace (upsert) availability
export const upsertAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!isOid(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctorId" });
    }

    const {
      weekly,
      dateWindows,
      blackoutWindows,
      slotSizeMinutes,
      bufferMinutes,
    } = req.body || {};

    // Basic validation
    if (weekly && !validateWeekly(weekly)) {
      return res.status(400).json({ success: false, message: "Invalid weekly windows" });
    }
    if (dateWindows && !validateWindows(dateWindows)) {
      return res.status(400).json({ success: false, message: "Invalid date windows" });
    }
    if (blackoutWindows && !validateWindows(blackoutWindows)) {
      return res.status(400).json({ success: false, message: "Invalid blackout windows" });
    }
    if (slotSizeMinutes && !(Number.isInteger(slotSizeMinutes) && slotSizeMinutes >= 5 && slotSizeMinutes <= 240)) {
      return res.status(400).json({ success: false, message: "slotSizeMinutes must be an integer 5–240" });
    }
    if (bufferMinutes && !(Number.isInteger(bufferMinutes) && bufferMinutes >= 0 && bufferMinutes <= 120)) {
      return res.status(400).json({ success: false, message: "bufferMinutes must be an integer 0–120" });
    }

    const payload = {};
    if (weekly !== undefined) payload.weekly = weekly;
    if (dateWindows !== undefined) payload.dateWindows = dateWindows;
    if (blackoutWindows !== undefined) payload.blackoutWindows = blackoutWindows;
    if (slotSizeMinutes !== undefined) payload.slotSizeMinutes = slotSizeMinutes;
    if (bufferMinutes !== undefined) payload.bufferMinutes = bufferMinutes;

    const doc = await Availability.findOneAndUpdate(
      { doctorId },
      { doctorId, ...payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, availability: doc });
  } catch (e) {
    console.error("Upsert availability error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Partial update
export const patchAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!isOid(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctorId" });
    }

    const updates = {};
    for (const k of ["weekly", "dateWindows", "blackoutWindows", "slotSizeMinutes", "bufferMinutes"]) {
      if (k in req.body) updates[k] = req.body[k];
    }

    if ("weekly" in updates && !validateWeekly(updates.weekly)) {
      return res.status(400).json({ success: false, message: "Invalid weekly windows" });
    }
    if ("dateWindows" in updates && !validateWindows(updates.dateWindows)) {
      return res.status(400).json({ success: false, message: "Invalid date windows" });
    }
    if ("blackoutWindows" in updates && !validateWindows(updates.blackoutWindows)) {
      return res.status(400).json({ success: false, message: "Invalid blackout windows" });
    }
    if ("slotSizeMinutes" in updates) {
      const v = updates.slotSizeMinutes;
      if (!(Number.isInteger(v) && v >= 5 && v <= 240)) {
        return res.status(400).json({ success: false, message: "slotSizeMinutes must be an integer 5–240" });
      }
    }
    if ("bufferMinutes" in updates) {
      const v = updates.bufferMinutes;
      if (!(Number.isInteger(v) && v >= 0 && v <= 120)) {
        return res.status(400).json({ success: false, message: "bufferMinutes must be an integer 0–120" });
      }
    }

    const doc = await Availability.findOneAndUpdate(
      { doctorId },
      { $set: updates },
      { new: true }
    );

    // If doc doesn't exist, you can choose to 404 or upsert. Here we 404.
    if (!doc) return res.status(404).json({ success: false, message: "Availability not found" });

    return res.status(200).json({ success: true, availability: doc });
  } catch (e) {
    console.error("Patch availability error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Read one
export const getAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!isOid(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctorId" });
    }

    const doc = await Availability.findOne({ doctorId });
    return res.status(200).json({ success: true, availability: doc });
  } catch (e) {
    console.error("Get availability error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Delete
export const deleteAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!isOid(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctorId" });
    }

    const result = await Availability.findOneAndDelete({ doctorId });
    // idempotent success
    return res.status(200).json({ success: true, deleted: !!result });
  } catch (e) {
    console.error("Delete availability error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Admin list (optional)
export const listAvailability = async (req, res) => {
  try {
    const { doctorId, page = 1, limit = 25 } = req.query;
    const q = {};
    if (doctorId) {
      if (!isOid(doctorId)) {
        return res.status(400).json({ success: false, message: "Invalid doctorId" });
      }
      q.doctorId = doctorId;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Availability.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limitNum).lean(),
      Availability.countDocuments(q),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      items,
    });
  } catch (e) {
    console.error("List availability error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Compute available slots in [from,to)
export const getAvailableSlots = async (req, res) => {
  try {
    const { doctorId } = req.params;
    let { from, to, slotSizeMinutes } = req.query;

    if (!isOid(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctorId" });
    }
    const availability = await Availability.findOne({ doctorId });
    if (!availability) {
      return res.status(200).json({ success: true, slotSizeMinutes: null, slots: [] });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (!(from && to) || isNaN(fromDate) || isNaN(toDate) || toDate <= fromDate) {
      return res.status(400).json({ success: false, message: "Invalid from/to window" });
    }

    const slotSize =
      slotSizeMinutes != null
        ? Math.max(5, Math.min(parseInt(slotSizeMinutes, 10) || 30, 240))
        : Math.max(5, Math.min(availability.slotSizeMinutes || 30, 240));

    const bufferMs = Math.max(0, Math.min((availability.bufferMinutes || 0) * 60000, 120 * 60000));

    // 1) candidate windows
    const candidate = buildCandidateWindows(availability, fromDate, toDate);

    // 2) busy = blackout + existing appointments
    const busy = [];

    for (const w of availability.blackoutWindows || []) {
      const clipped = clampWindow(w, fromDate, toDate);
      if (clipped) busy.push(clipped);
    }

    const appts = await Appointment.find({
      doctorId,
      startTime: { $lt: toDate },
      endTime: { $gt: fromDate },
      status: { $in: ["pending", "confirmed"] },
    }).select("startTime endTime");

    for (const a of appts) {
      const win = { start: a.startTime, end: a.endTime };
      busy.push(bufferMs ? expandWindowByBuffer(win, bufferMs) : win);
    }

    // 3) free windows then split into slots
    const freeWindows = subtractWindows(candidate, busy);
    const slots = freeWindows.flatMap((w) => splitIntoSlots(w.start, w.end, slotSize));

    return res.status(200).json({ success: true, slotSizeMinutes: slotSize, slots });
  } catch (e) {
    console.error("Get available slots error:", e);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
