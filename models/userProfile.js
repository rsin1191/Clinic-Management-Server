import mongoose from 'mongoose'
import { type } from 'os'
const { Schema } = mongoose

// -------- Patient Profile --------
const medicalHistory = new mongoose.Schema(
  {
    condition: {
      type: String,
    },
    diagnosedOn: {
      type: Date,
    },
    notes: {
      type: String,
    },
  },
  {
    _id: false,
  }
)

export const patientProfileSchema = new mongoose.Schema({
  healthCardNumber: {
    type: String,
  },
  sex: {
    type: String,
    enum: ['MALE', 'FEMALE']
  },
  dob: {
    type: Date,
    validate: value => value <= new Date()
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  },
  isOrganDonor: {
    type: Boolean,
  },
  medicalHistory: [medicalHistory],
},
  {
    _id: false
  })

// -------- Doctor Profile --------
const educationSchema = new Schema({
  school: String,
  degree: String,
  field: String,
  startDate: Date,
  endDate: Date,
  description: String
}, { _id: false })

educationSchema.path('endDate').validate(function (v) {
  if (!v || !this.startDate) return true
  return v >= this.startDate
}, 'Education endDate must be after startDate')

const experienceSchema = new Schema({
  organization: String,
  title: String,
  startDate: Date,
  endDate: Date,
  description: String
}, { _id: false })

experienceSchema.path('endDate').validate(function (v) {
  if (!v || !this.startDate) return true
  return v >= this.startDate
}, 'Experience endDate must be after startDate')

const photoSchema = new Schema({
  data: Buffer,
  contentType: String,
  updatedAt: Date
}, { _id: false })

export const doctorProfileSchema = new Schema({
  medicalLicenceNumber: {
    type: String,
    index: { unique: true, sparse: true }
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: v => !v || /^\+?[0-9().\-\s]{7,20}$/.test(v),
      message: 'Invalid phone format'
    }
  },
  workEmail: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid work email format'
    }
  },
  specialty: {
    type: String,
    default: 'General Practitioner'
  },
  bio: String,
  timezone: {
    type: String,
    default: 'America/Toronto',
    validate: {
      validator: v => /^[A-Za-z_]+\/[A-Za-z_\-]+$/.test(v),
      message: 'Timezone must be an IANA name like "America/Toronto"'
    }
  },
  education: { type: [educationSchema], default: [] },
  experience: { type: [experienceSchema], default: [] },
  photo: photoSchema
}, { _id: false })
