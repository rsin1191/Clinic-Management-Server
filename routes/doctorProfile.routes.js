import express from 'express'
import auth from '../middlewares/auth.middleware.js'
import {
    searchDoctors,
    getDoctorPublicProfile,
    getDoctorProfile,
    updateDoctorProfile,
    uploadDoctorPhoto,
    getDoctorPhoto,
    getDoctorPhotoById,
} from '../controllers/doctorProfile.controller.js'

const router = express.Router()

// patient-facing search for "Find a Doctor" page
router.get('/search', searchDoctors)

// current logged-in doctor
router.get('/me/profile', auth, getDoctorProfile)
router.put('/me/profile', auth, updateDoctorProfile)

// photo buffer endpoints (self)
router.post('/me/profile/photo', auth, uploadDoctorPhoto)
router.get('/me/profile/photo', auth, getDoctorPhoto)

// fetch a specific doctor's photo by id (for patient browsing)
router.get('/:id/photo', getDoctorPhotoById)

// public doctor profile by id (for patient when clicking a card)
router.get('/:id', getDoctorPublicProfile)

export default router