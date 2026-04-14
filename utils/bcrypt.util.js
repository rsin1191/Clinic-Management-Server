import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

//converts user entered password to hashed password
export const hashPassword = async (password) =>
  await bcrypt.hash(password, SALT_ROUNDS)

//compares user entered password to hashed password
export const comparePassword = async (password, hashedPassword) =>
  await bcrypt.compare(String(password), String(hashedPassword)) //pwd and hashed pws must be strings
