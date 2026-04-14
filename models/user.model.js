import mongoose from 'mongoose'
import { patientProfileSchema, doctorProfileSchema } from './userProfile.js'


const userSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    enum: ['DOCTOR', 'PATIENT']
  },
  firstName: {
    type: String,
    required: true,
    trim: true,

  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    trim: true,
    select: false,
  },
  patientProfile: patientProfileSchema,
  doctorProfile: { type: doctorProfileSchema, default: () => ({}) },

  isProfileActive: {
    type: Boolean,
    required: true,
    default: true
  }
}, {
  timestamps: true
})

const User = new mongoose.model('User', userSchema)

export default User