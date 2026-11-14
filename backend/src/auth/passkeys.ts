import {
   generateAuthenticationOptions,
   generateRegistrationOptions,
   verifyAuthenticationResponse,
   verifyRegistrationResponse,
   type AuthenticationResponseJSON,
   type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { isValidObjectId, Types } from 'mongoose'
import { BadRequestError, NotFoundError, UnauthorizedError } from '../errors'
import type { SendMail } from '../mail/mailer'
import { Passkey, type PasskeyType } from '../models/passkeyModel'
import { User, type UserType } from '../models/userModel'
import { WebAuthnChallenge } from '../models/webauthnChallengeModel'

const CHALLENGE_TTL_MS = 5 * 60_000
const SIGN_IN_FAILED = 'Passkey sign-in failed. Try again or use your password.'

type Deps = { rpID: string; rpName: string; origin: string; appUrl: string; sendMail: SendMail }

export const passkeyView = (p: PasskeyType) => ({
   id: p._id.toString(),
   name: p.name,
   deviceType: p.deviceType,
   backedUp: p.backedUp,
   createdAt: p.createdAt.toISOString(),
   lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
})

export function createPasskeyService({ rpID, rpName, origin, appUrl, sendMail }: Deps) {
   async function saveChallenge(challenge: string, purpose: 'register' | 'login', userId: Types.ObjectId | null) {
      const doc = await WebAuthnChallenge.create({
         challenge,
         purpose,
         userId,
         expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      })
      return doc._id.toString()
   }

   /** Single use: the challenge is deleted as it's read. */
   async function takeChallenge(id: unknown, purpose: 'register' | 'login', userId: Types.ObjectId | null) {
      if (typeof id !== 'string' || !isValidObjectId(id)) return null
      const doc = await WebAuthnChallenge.findOneAndDelete({
         _id: id,
         purpose,
         userId,
         expiresAt: { $gt: new Date() },
      }).lean()
      return doc?.challenge ?? null
   }

   async function notify(user: UserType, template: 'passkey_added' | 'passkey_removed', passkey: string) {
      try {
         await sendMail(template, user.email, { name: user.fname, passkey, link: new URL('/account', appUrl).toString() })
      } catch (error) {
         console.error(`Email "${template}" not sent:`, (error as Error).message)
      }
   }

   async function loadUser(userId: Types.ObjectId) {
      const user = await User.findById(userId)
      if (!user) throw new UnauthorizedError('Not signed in')
      return user
   }

   return {
      list: async (userId: Types.ObjectId) =>
         (await Passkey.find({ userId }).sort({ createdAt: 1 })).map(passkeyView),

      async registrationOptions(userId: Types.ObjectId) {
         const user = await loadUser(userId)
         const existing = await Passkey.find({ userId }).lean()
         const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userName: user.email,
            userDisplayName: `${user.fname} ${user.lname}`.trim(),
            // Stable per account, so a device replaces its old passkey instead of adding a duplicate.
            userID: new Uint8Array(user._id.id),
            attestationType: 'none',
            excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
            authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
         })
         const challengeId = await saveChallenge(options.challenge, 'register', user._id)
         return { challengeId, options }
      },

      async register(userId: Types.ObjectId, challengeId: unknown, response: RegistrationResponseJSON, name: string) {
         const user = await loadUser(userId)
         const expectedChallenge = await takeChallenge(challengeId, 'register', user._id)
         if (!expectedChallenge) throw new BadRequestError('This passkey request expired. Please try again.', undefined, 'CHALLENGE_EXPIRED')

         let verification
         try {
            verification = await verifyRegistrationResponse({
               response,
               expectedChallenge,
               expectedOrigin: origin,
               expectedRPID: rpID,
               requireUserVerification: false,
            })
         } catch (error) {
            throw new BadRequestError(`The passkey couldn’t be verified: ${(error as Error).message}`, undefined, 'PASSKEY_INVALID')
         }
         if (!verification.verified) throw new BadRequestError('The passkey couldn’t be verified.', undefined, 'PASSKEY_INVALID')

         const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
         if (await Passkey.exists({ credentialId: credential.id })) {
            throw new BadRequestError('This passkey is already registered.', undefined, 'PASSKEY_EXISTS')
         }
         const passkey = await Passkey.create({
            userId: user._id,
            credentialId: credential.id,
            publicKey: Buffer.from(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports ?? [],
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            name,
         })
         await notify(user, 'passkey_added', passkey.name)
         return passkeyView(passkey)
      },

      async loginOptions() {
         // No allowCredentials: the browser offers any passkey it holds for this site.
         const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
         const challengeId = await saveChallenge(options.challenge, 'login', null)
         return { challengeId, options }
      },

      /** Verifies a passkey assertion and returns its user; any failure is the same 401. */
      async login(challengeId: unknown, response: AuthenticationResponseJSON) {
         const expectedChallenge = await takeChallenge(challengeId, 'login', null)
         if (!expectedChallenge) throw new UnauthorizedError(SIGN_IN_FAILED, 'PASSKEY_FAILED')

         const passkey = typeof response?.id === 'string' ? await Passkey.findOne({ credentialId: response.id }) : null
         if (!passkey) throw new UnauthorizedError(SIGN_IN_FAILED, 'PASSKEY_FAILED')
         // The authenticator reports which account the passkey belongs to; it must match.
         const userHandle = response.response?.userHandle
         if (userHandle && userHandle !== isoBase64URL.fromBuffer(new Uint8Array(passkey.userId.id))) {
            throw new UnauthorizedError(SIGN_IN_FAILED, 'PASSKEY_FAILED')
         }

         let verification
         try {
            verification = await verifyAuthenticationResponse({
               response,
               expectedChallenge,
               expectedOrigin: origin,
               expectedRPID: rpID,
               credential: {
                  id: passkey.credentialId,
                  publicKey: new Uint8Array(passkey.publicKey),
                  counter: passkey.counter,
                  transports: passkey.transports,
               },
               requireUserVerification: false,
            })
         } catch {
            throw new UnauthorizedError(SIGN_IN_FAILED, 'PASSKEY_FAILED')
         }
         if (!verification.verified) throw new UnauthorizedError(SIGN_IN_FAILED, 'PASSKEY_FAILED')

         passkey.counter = verification.authenticationInfo.newCounter
         passkey.lastUsedAt = new Date()
         await passkey.save()
         const user = await User.findById(passkey.userId)
         if (!user?.emailVerifiedAt) throw new UnauthorizedError(SIGN_IN_FAILED, 'PASSKEY_FAILED')
         return user
      },

      async rename(userId: Types.ObjectId, id: string, name: string) {
         const passkey = isValidObjectId(id) ? await Passkey.findOne({ _id: id, userId }) : null
         if (!passkey) throw new NotFoundError('Passkey not found')
         passkey.name = name
         await passkey.save()
         return passkeyView(passkey)
      },

      async remove(userId: Types.ObjectId, id: string) {
         const passkey = isValidObjectId(id) ? await Passkey.findOneAndDelete({ _id: id, userId }) : null
         if (!passkey) throw new NotFoundError('Passkey not found')
         await notify(await loadUser(userId), 'passkey_removed', passkey.name)
      },
   }
}

export type PasskeyService = ReturnType<typeof createPasskeyService>
