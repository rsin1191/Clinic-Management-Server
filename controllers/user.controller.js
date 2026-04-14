import User from '../models/user.model.js'
import { comparePassword, hashPassword } from '../utils/bcrypt.util.js'
import jwt from 'jsonwebtoken'



export const signupUser = async (req, res) => {
  const user = req.body
  const { role, firstName, lastName, email, password } = user

  // check if email already exist
  const existingUser = await User.findOne({ email })
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'Email already registered',
    })
  }

  const hashedPassword = await hashPassword(password)

  try {
    const newUser = new User({
      ...user,
      password: hashedPassword,
      isProfileComplete: false,
    })
    await newUser.save()
    return res.status(201).json({
      success: true,
      message: 'SignUp Successful',
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    })
  }
}

export const signinUser = async (req, res) => {
  const userCredentials = req.body
  const { email, password } = userCredentials

  try {
    const userFound = await User.findOne({ email }).select('+password')
    if (!userFound)
      return res
        .status(404)
        .json({ success: false, message: "User doesn't exist" })

    const isLoggedIn = await comparePassword(password, userFound.password)
    if (!isLoggedIn)
      return res
        .status(400)
        .json({ success: false, message: 'Invalid email or password' })
    else {
      userFound.password = undefined
      const token = jwt.sign({ id: userFound._id }, process.env.JWT_SECRET)
      return res.status(201).json({
        success: true,
        message: 'SignIn successful',
        token,
        userFound,
      })
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    })
  }
}

export const getUser = (req, res) => {
  if (!req.user)
    res.status(401).json({ success: false, message: 'User not authenticated' })
  res.status(200).json({ success: true, user: req.user })
}

export const getUsers = async (req, res) => {
  const { role } = req.params
  
  try {
    const users = await User.find({role: role.toUpperCase()})
    res.status(200).json({
      success: true,
      users,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    })
  }
}

export const updateUser = async (req, res) => {
  const { id } = req.params
  const userUpdate = req.body

  try {
    const updatedUser = await User.findByIdAndUpdate(id, userUpdate, {
      new: true,
    }).select('-password')
    return res.status(201).json({
      success: true,
      message: 'User profile updated',
      updatedUser,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    })
  }
}
export const listDoctors = async (req, res) => {
    try {
        const { q = '', limit = 50, skip = 0 } = req.query;

        // Basic filter: only doctors
        const filter = { role: 'DOCTOR' };

        // Optional search by name or specialty
        if (q) {
            filter.$or = [
                { firstName: { $regex: q, $options: 'i' } },
                { lastName: { $regex: q, $options: 'i' } },
                { 'doctorProfile.specialty': { $regex: q, $options: 'i' } },
            ];
        }

        // Query doctors (exclude sensitive fields)
        const doctors = await User.find(filter)
            .select('_id firstName lastName doctorProfile.specialty doctorProfile.workEmail doctorProfile.bio')
            .limit(Number(limit))
            .skip(Number(skip))
            .lean();

        if (!Array.isArray(doctors) || doctors.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        return res.status(200).json({
            success: true,
            count: doctors.length,
            data: doctors,
        });
    } catch (err) {
        console.error('Error listing doctors:', err);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
