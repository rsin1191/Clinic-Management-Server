import jwt from 'jsonwebtoken'
import User from '../models/user.model.js'

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No auth header' })
    }

    const token = authHeader.split(' ')[1]
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.id).select('-password')

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' })
    }

    req.user = user
    next()
  } catch (error) {
    console.error('Auth error:', error.message)
    return res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
}

export default auth
