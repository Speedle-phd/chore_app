import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { ROLES } from '../models/membershipModel'

const name = z.string().trim().min(1, 'Enter a name.').max(60)
const personName = z.string().trim().min(1).max(50)

export const householdNameSchema = z.object({ name })
export const profileSchema = z.object({ fname: personName, lname: personName })
export const roleSchema = z.object({ role: z.enum(ROLES) })
export const objectId = z.string().refine(isValidObjectId, 'Invalid id')
