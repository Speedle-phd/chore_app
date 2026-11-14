import { z } from 'zod'

// Normalize before validating: z.email() checks the raw string.
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.'))
// Policy (length, breaches) is checked separately so all problems are listed.
const password = z.string().min(1, 'Enter a password.').max(256)
const name = z.string().trim().min(1).max(50)
const token = z.string().min(20).max(200)

export const signupSchema = z.object({
   fname: name,
   lname: name,
   email,
   password,
})
export const loginSchema = z.object({ email, password })
export const emailOnlySchema = z.object({ email })
export const tokenSchema = z.object({ token })
export const resetPasswordSchema = z.object({ token, password })
export const changePasswordSchema = z.object({
   currentPassword: password,
   newPassword: password,
})
