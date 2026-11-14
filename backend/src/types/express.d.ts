import type { Types } from 'mongoose'
import type { MembershipType } from '../models/membershipModel'

declare global {
   namespace Express {
      interface Request {
         /** Set by requireSession; never taken from the request body. */
         auth?: { userId: Types.ObjectId; sessionHash: string }
         /** Set by requireMembership: the caller's membership in :hid. */
         membership?: MembershipType
      }
   }
}

export {}
