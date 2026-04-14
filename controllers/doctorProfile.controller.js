import multer from 'multer'
import User from '../models/user.model.js'

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image files are allowed'))
        cb(null, true)
    }
})

// GET /api/doctors/:id
// Public doctor profile (used when a patient clicks a card)
export const getDoctorPublicProfile = async (req, res) => {
    try {
        const { id } = req.params
        const user = await User.findById(id)
            .select('firstName lastName email role doctorProfile')

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }
        if (user.role !== 'DOCTOR') {
            return res.status(400).json({ success: false, message: 'Not a doctor' })
        }

        const doc = user.doctorProfile || {}
        let photoUrl
        if (doc.photo && doc.photo.data && doc.photo.contentType) {
            const ver = doc.photo.updatedAt ? `?v=${new Date(doc.photo.updatedAt).getTime()}` : ''
            photoUrl = `/api/doctors/${user._id}/photo${ver}`
        }

        return res.status(200).json({
            success: true,
            doctor: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                doctorProfile: {
                    ...(doc.toObject?.() ?? doc),
                    photoUrl
                }
            }
        })
    } catch (_err) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

// GET /api/doctors/me/profile
export const getDoctorProfile = async (req, res) => {
    try {
        const doctorId = req.user?._id || req.user?.id
        const user = await User.findById(doctorId)
            .select('firstName lastName email role doctorProfile')

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }

        const base = {
            success: true,
            doctor: {},
            basic: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email
            }
        }

        if (user.role !== 'DOCTOR') {
            return res.status(200).json(base)
        }

        const doc = user.doctorProfile || {}
        // If a photo buffer exists, expose an auth-protected endpoint for the client to fetch
        let photoUrl
        if (doc.photo && doc.photo.data && doc.photo.contentType) {
            const ver = doc.photo.updatedAt ? `?v=${new Date(doc.photo.updatedAt).getTime()}` : ''
            photoUrl = `/api/doctors/me/profile/photo${ver}`
        }

        return res.status(200).json({
            success: true,
            doctor: { ...(doc.toObject?.() ?? doc), photoUrl },
            basic: base.basic
        })
    } catch (_err) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

// PUT /api/doctors/me/profile
export const updateDoctorProfile = async (req, res) => {
    try {
        const doctorId = req.user?._id || req.user?.id
        const current = await User.findById(doctorId).select('role')
        if (!current) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }
        if (current.role !== 'DOCTOR') {
            return res.status(403).json({ success: false, message: 'Only doctors can update a doctor profile' })
        }

        const {
            medicalLicenceNumber,
            specialty,
            phone,
            workEmail,         // NEW: accept workEmail from payload
            bio,
            timezone,
            education,
            experience
        } = req.body || {}

        // Build a precise $set so we don’t wipe fields unintentionally
        const set = {}
        if (medicalLicenceNumber !== undefined) set['doctorProfile.medicalLicenceNumber'] = medicalLicenceNumber
        if (specialty !== undefined) set['doctorProfile.specialty'] = specialty
        if (phone !== undefined) set['doctorProfile.phone'] = phone
        if (workEmail !== undefined) set['doctorProfile.workEmail'] = workEmail // NEW
        if (bio !== undefined) set['doctorProfile.bio'] = bio
        if (timezone !== undefined) set['doctorProfile.timezone'] = timezone
        if (Array.isArray(education)) set['doctorProfile.education'] = education
        if (Array.isArray(experience)) set['doctorProfile.experience'] = experience

        if (Object.keys(set).length === 0) {
            return res.status(400).json({ success: false, message: 'No updatable fields provided' })
        }

        const updated = await User.findByIdAndUpdate(
            doctorId,
            { $set: set },
            { new: true, runValidators: true, context: 'query' }
        ).select('doctorProfile')

        return res.status(200).json({
            success: true,
            message: 'Doctor profile updated',
            doctor: updated.doctorProfile || {}
        })
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Duplicate value for a unique field',
                fields: Object.keys(error.keyPattern || {})
            })
        }
        if (error?.name === 'ValidationError') {
            const messages = Object.values(error.errors || {}).map(e => e.message)
            return res.status(400).json({
                success: false,
                message: messages[0] || 'Validation failed',
                errors: messages
            })
        }
        if (error?.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: `Invalid value for ${error.path}`
            })
        }
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

// POST /api/doctors/me/profile/photo
export const uploadDoctorPhoto = [
    upload.single('photo'),
    async (req, res) => {
        try {
            const doctorId = req.user?._id || req.user?.id
            const current = await User.findById(doctorId).select('role doctorProfile')
            if (!current) {
                return res.status(404).json({ success: false, message: 'User not found' })
            }
            if (current.role !== 'DOCTOR') {
                return res.status(403).json({ success: false, message: 'Only doctors can upload a photo' })
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' })
            }

            current.doctorProfile = current.doctorProfile || {}
            current.doctorProfile.photo = {
                data: req.file.buffer,
                contentType: req.file.mimetype,
                updatedAt: new Date()
            }

            await current.save()

            const ver = current.doctorProfile.photo.updatedAt.getTime()
            return res.status(200).json({
                success: true,
                message: 'Photo updated',
                photoUrl: `/api/doctors/me/profile/photo?v=${ver}`
            })
        } catch (err) {
            if (err?.message === 'Only image files are allowed') {
                return res.status(400).json({ success: false, message: err.message })
            }
            if (err?.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: 'File too large (max 5MB)' })
            }
            return res.status(500).json({ success: false, message: 'Internal Server Error' })
        }
    }
]

// GET /api/doctors/me/profile/photo
export const getDoctorPhoto = async (req, res) => {
    try {
        const doctorId = req.user?._id || req.user?.id
        const user = await User.findById(doctorId).select('role doctorProfile')
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }
        if (user.role !== 'DOCTOR') {
            return res.status(403).json({ success: false, message: 'Only doctors can access photo' })
        }
        const photo = user.doctorProfile?.photo
        if (!photo?.data || !photo?.contentType) {
            return res.status(404).json({ success: false, message: 'No photo found' })
        }
        res.set('Content-Type', photo.contentType)
        // prevent caching stale blobs when user uploads a new one
        res.set('Cache-Control', 'no-store, max-age=0')
        return res.status(200).send(photo.data)
    } catch (_err) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

// GET /api/doctors/:id/photo
export const getDoctorPhotoById = async (req, res) => {
    try {
        const { id } = req.params
        const user = await User.findById(id).select('role doctorProfile')
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' })
        }
        if (user.role !== 'DOCTOR') {
            return res.status(400).json({ success: false, message: 'Not a doctor' })
        }
        const photo = user.doctorProfile?.photo
        if (!photo?.data || !photo?.contentType) {
            return res.status(404).json({ success: false, message: 'No photo found' })
        }
        res.set('Content-Type', photo.contentType)
        res.set('Cache-Control', 'no-store, max-age=0')
        return res.status(200).send(photo.data)
    } catch (_err) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

// GET /api/doctors/search
// Search & paginate doctors for the "Find a Doctor" page
export const searchDoctors = async (req, res) => {
    try {
        const {
            search = '',
            specialty,
            page = '1',
            limit = '3'
        } = req.query || {}

        const pageNum = Math.max(parseInt(page, 10) || 1, 1)
        const pageSize = Math.max(parseInt(limit, 10) || 3, 1)

        const baseQuery = { role: 'DOCTOR' }
        if (specialty) {
            baseQuery['doctorProfile.specialty'] = specialty
        }

        const doctors = await User.find(baseQuery)
            .select('firstName lastName email role doctorProfile')
            .lean()

        let filtered = doctors

        const term = String(search || '').trim()
        if (term) {
            const regex = new RegExp(term, 'i') // case-insensitive

            filtered = filtered.filter((d) => {
                const name = `${d.firstName || ''} ${d.lastName || ''}`.trim()
                return regex.test(name)
            })

            filtered.sort((a, b) => {
                const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim()
                const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim()

                const aMatch = regex.test(nameA)
                const bMatch = regex.test(nameB)

                if (aMatch && !bMatch) return -1
                if (!aMatch && bMatch) return 1
                return 0
            })
        }

        const total = filtered.length
        const start = (pageNum - 1) * pageSize
        const end = start + pageSize
        const pageItems = filtered.slice(start, end)

        // attach photoUrl for cards
        const doctorsWithPhoto = pageItems.map((d) => {
            const docProfile = d.doctorProfile || {}
            let photoUrl

            if (docProfile.photo && docProfile.photo.data && docProfile.photo.contentType) {
                const ver = docProfile.photo.updatedAt
                    ? `?v=${new Date(docProfile.photo.updatedAt).getTime()}`
                    : ''
                photoUrl = `/api/doctors/${d._id}/photo${ver}`
            }

            return {
                ...d,
                doctorProfile: {
                    ...docProfile,
                    photoUrl
                }
            }
        })

        return res.status(200).json({
            success: true,
            doctors: doctorsWithPhoto,
            page: pageNum,
            pageSize,
            total,
            hasMore: end < total
        })
    } catch (_err) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}
