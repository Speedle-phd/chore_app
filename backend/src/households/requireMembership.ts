import type { NextFunction, Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { NotFoundError, UnauthorizedError } from '../errors'
import { Membership } from '../models/membershipModel'

/**
 * Loads the caller's membership for `:hid` into req.membership. A household the
 * caller doesn't belong to is a 404, so its existence isn't revealed.
 */
export async function requireMembership(req: Request, _res: Response, next: NextFunction) {
   if (!req.auth) throw new UnauthorizedError('Not signed in')
   const hid = req.params.hid
   if (typeof hid !== 'string' || !isValidObjectId(hid)) throw new NotFoundError('Household not found')
   const membership = await Membership.findOne({ householdId: hid, userId: req.auth.userId })
   if (!membership) throw new NotFoundError('Household not found')
   req.membership = membership
   next()
}
