import "dotenv/config";
import helmet from "helmet";
import express from "express";
import { signInValidation, signUpValidation } from "./middlewares/validate.js";
import connectDB from "./config/db.js";
import {
  getUser,
  getUsers,
  signinUser,
  signupUser,
  updateUser,
  listDoctors,
} from "./controllers/user.controller.js";

import auth from "./middlewares/auth.middleware.js";
import doctorProfileRoutes from "./routes/doctorProfile.routes.js";
import testimonialRoutes from "./routes/testimonial.routes.js";

import Appointment from "./models/Appointment.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";

import Availability from "./models/Availability.js";
import availabilityRoutes from "./routes/availabilityRoutes.js";

const app = express();
const port = process.env.PORT || 3000;
const mongoURI = process.env.MONGO_URI;

app.use(helmet());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "App running OK",
  });
});

app.post("/api/signup", signUpValidation, signupUser);
app.post("/api/signin", signInValidation, signinUser);
app.get("/api/me", auth, getUser);
app.get("/api/users/:role", getUsers);
app.put("/api/user/:id", updateUser);
app.get("/api/doctors", listDoctors);

app.use("/api/doctors", doctorProfileRoutes);
app.use("/api/testimonials", testimonialRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/availability", availabilityRoutes);

const start = async () => {
  try {
    await connectDB(mongoURI);
    await Appointment.syncIndexes();
    await Availability.syncIndexes();

    app.listen(port, () => console.log(`Server is listening on port ${port}...`));
  } catch (error) {
    console.log("Error in start " + error);
  }
};

start();
