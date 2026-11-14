import type { Types } from 'mongoose'
import {
   BadRequestError,
   ForbiddenError,
   TooManyRequestsError,
   UnauthorizedError,
} from '../errors'
import type { MailTemplate, SendMail } from '../mail/mailer'
import { User, type UserType } from '../models/userModel'
import {
   consumeActionToken,
   issueActionToken,
   peekActionToken,
} from './actionTokens'
import {
   dummyVerify,
   hashPassword,
   needsRehash,
   passwordContext,
   passwordProblems,
   verifyPassword,
   type BreachCheck,
} from './password'
import { clearFailures, lockedForSeconds, recordFailure } from './throttle'

type Deps = { sendMail: SendMail; isBreached: BreachCheck; appUrl: string }

const INVALID_LINK = 'This link is invalid or has expired. Please request a new one.'
const BAD_CREDENTIALS = 'Email or password is incorrect.'

export function createAuthService({ sendMail, isBreached, appUrl }: Deps) {
   const link = (path: string, token?: string) => {
      const url = new URL(path, appUrl)
      if (token) url.searchParams.set('token', token)
      return url.toString()
   }

   /**
    * Emails on enumeration-sensitive paths never fail the request: an error
    * would answer differently for existing and new accounts. Logged instead.
    */
   async function mailQuietly(
      template: MailTemplate,
      user: UserType,
      data: Record<string, unknown>,
   ) {
      try {
         await sendMail(template, user.email, { name: user.fname, ...data })
      } catch (error) {
         console.error(`Email "${template}" not sent:`, (error as Error).message)
      }
   }

   async function assertStrongPassword(
      password: string,
      user: { email: string; fname?: string; lname?: string },
   ) {
      const problems = await passwordProblems(
         password,
         passwordContext(user),
         isBreached,
      )
      if (problems.length) {
         throw new BadRequestError(
            'Please choose a stronger password.',
            problems,
            'WEAK_PASSWORD',
         )
      }
   }

   async function sendVerification(user: UserType, now: Date) {
      const token = await issueActionToken(user._id, 'verify_email', now)
      if (token) await mailQuietly('verify_email', user, { link: link('/verify-email', token) })
   }

   return {
      /** Same outcome whether or not the email is registered (no enumeration). */
      async signup(
         input: { fname: string; lname: string; email: string; password: string },
         now: Date,
      ): Promise<{ created: UserType | null }> {
         // Password policy first, so a weak password answers the same for every email.
         await assertStrongPassword(input.password, input)

         const passwordHash = await hashPassword(input.password)
         const existing = await User.findOne({ email: input.email })
         if (existing) {
            if (existing.emailVerifiedAt) {
               await mailQuietly('account_exists', existing, {
                  login_link: link('/login'),
                  reset_link: link('/forgot-password'),
               })
            } else {
               await sendVerification(existing, now)
            }
            return { created: null }
         }

         let user: UserType
         try {
            user = await User.create({
               fname: input.fname,
               lname: input.lname,
               email: input.email,
               passwordHash,
            })
         } catch (error) {
            // Lost a race with a parallel signup for the same email: same answer.
            if ((error as { code?: number }).code === 11000) return { created: null }
            throw error
         }
         await sendVerification(user, now)
         return { created: user }
      },

      async resendVerification(email: string, now: Date) {
         const user = await User.findOne({ email })
         if (user && !user.emailVerifiedAt) await sendVerification(user, now)
      },

      async verifyEmail(token: string, now: Date): Promise<UserType> {
         const userId = await consumeActionToken(token, 'verify_email', now)
         const user = userId && (await User.findById(userId))
         if (!user) throw new BadRequestError(INVALID_LINK, undefined, 'INVALID_TOKEN')
         if (!user.emailVerifiedAt) {
            user.emailVerifiedAt = now
            await user.save()
         }
         return user
      },

      async login(
         email: string,
         password: string,
         now: Date,
      ): Promise<{ user: UserType | null; failedUserId: Types.ObjectId | null }> {
         const wait = await lockedForSeconds(email, now)
         if (wait > 0) {
            throw new TooManyRequestsError(
               `Too many failed attempts. Try again in ${wait} seconds.`,
               wait,
            )
         }

         const user = await User.findOne({ email })
         const valid = user
            ? await verifyPassword(user.passwordHash, password)
            : (await dummyVerify(password), false)

         if (!user || !valid) {
            await recordFailure(email, now)
            return { user: null, failedUserId: user?._id ?? null }
         }

         await clearFailures(email)
         if (needsRehash(user.passwordHash)) {
            user.passwordHash = await hashPassword(password)
            await user.save()
         }
         // Only revealed after a correct password, so it doesn't leak existence.
         if (!user.emailVerifiedAt) {
            await sendVerification(user, now)
            throw new ForbiddenError(
               'Please confirm your email address first. We sent you a new link.',
               'EMAIL_NOT_VERIFIED',
            )
         }
         return { user, failedUserId: null }
      },

      async forgotPassword(email: string, now: Date): Promise<UserType | null> {
         const user = await User.findOne({ email })
         if (!user) return null
         const token = await issueActionToken(user._id, 'reset_password', now)
         if (token) {
            await mailQuietly('reset_password', user, {
               link: link('/reset-password', token),
            })
         }
         return user
      },

      /** Sets a new password from an emailed token. The caller revokes sessions. */
      async resetPassword(token: string, password: string, now: Date): Promise<UserType> {
         const userId = await peekActionToken(token, 'reset_password', now)
         const user = userId && (await User.findById(userId))
         if (!user) throw new BadRequestError(INVALID_LINK, undefined, 'INVALID_TOKEN')

         // Check the policy before using up the token, so a weak password can be retried.
         await assertStrongPassword(password, user)
         if (!(await consumeActionToken(token, 'reset_password', now))) {
            throw new BadRequestError(INVALID_LINK, undefined, 'INVALID_TOKEN')
         }

         user.passwordHash = await hashPassword(password)
         user.passwordChangedAt = now
         // The emailed link proves ownership of the address.
         user.emailVerifiedAt ??= now
         await user.save()
         await clearFailures(user.email)
         await mailQuietly('password_changed', user, { reset_link: link('/forgot-password') })
         return user
      },

      async changePassword(
         userId: Types.ObjectId,
         currentPassword: string,
         newPassword: string,
         now: Date,
      ): Promise<UserType> {
         const user = await User.findById(userId)
         if (!user) throw new UnauthorizedError('Not signed in')

         const wait = await lockedForSeconds(user.email, now)
         if (wait > 0) {
            throw new TooManyRequestsError(
               `Too many failed attempts. Try again in ${wait} seconds.`,
               wait,
            )
         }
         if (!(await verifyPassword(user.passwordHash, currentPassword))) {
            await recordFailure(user.email, now)
            throw new BadRequestError(
               'Your current password is incorrect.',
               undefined,
               'WRONG_PASSWORD',
            )
         }
         await assertStrongPassword(newPassword, user)

         user.passwordHash = await hashPassword(newPassword)
         user.passwordChangedAt = now
         await user.save()
         await clearFailures(user.email)
         await mailQuietly('password_changed', user, { reset_link: link('/forgot-password') })
         return user
      },
   }
}

export type AuthService = ReturnType<typeof createAuthService>

export { BAD_CREDENTIALS }
