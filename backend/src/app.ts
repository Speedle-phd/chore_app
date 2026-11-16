import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import mongoose from 'mongoose'
import pinoHttp from 'pino-http'
import type { Env } from './config/env'
import {
   createAuthRoutes,
   DEFAULT_RATE_LIMITS,
   limiter,
   type RateLimits,
} from './auth/authRoutes'
import { createAuthService } from './auth/authService'
import { createPasskeyRoutes } from './auth/passkeyRoutes'
import { createPasskeyService } from './auth/passkeys'
import { isBreachedPassword, type BreachCheck } from './auth/password'
import { createSessions, sessionConfig } from './auth/sessions'
import { createAccountRoutes, createUserSearchRoutes } from './account/accountRoutes'
import { createAccountService } from './account/accountService'
import { createCalendarService } from './calendar/calendarService'
import { createReminderService } from './reminders/reminderService'
import { createFeedRoutes } from './ical/icalRoutes'
import { createIcalService } from './ical/icalService'
import { createShoppingService } from './shopping/shoppingService'
import { createRecipeService } from './recipes/recipeService'
import { createHouseholdRoutes } from './households/householdRoutes'
import { createInvitationRoutes } from './invitations/invitationRoutes'
import { createInvitationService } from './invitations/invitationService'
import { createHouseholdService } from './households/householdService'
import { createMailer, type SendMail } from './mail/mailer'
import { csrfProtection } from './middleware/csrf'
import { errorHandler } from './middleware/errorHandler'
import { notFound } from './middleware/notFound'

export function corsOptions(env: Pick<Env, 'APP_URL'>) {
   return {
      origin: env.APP_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
   }
}

/** Feed fetches per IP per 15 minutes; calendar services poll from shared addresses. App choice. */
const FEED_RATE_LIMIT = 300
/** Recipe imports per IP per 15 minutes: each one makes the server fetch another website. App choice. */
const IMPORT_RATE_LIMIT = 60

/** Replaceable collaborators (tests swap in fakes for email and the breach API). */
export type AppDeps = {
   sendMail?: SendMail
   isBreached?: BreachCheck
   rateLimits?: RateLimits
   /** Tests only: addresses the recipe importer may fetch despite the SSRF rules (a local test server). */
   allowFetchAddress?: (address: string) => boolean
}

/** Builds the HTTP app without starting a server or connecting to MongoDB (testable). */
export function createApp(env: Env, deps: AppDeps = {}) {
   const app = express()
   const sessions = createSessions(sessionConfig(env.COOKIE_SECURE))
   const sendMail = deps.sendMail ?? createMailer(env)
   const limits = deps.rateLimits ?? DEFAULT_RATE_LIMITS
   const auth = createAuthService({
      sendMail,
      isBreached: deps.isBreached ?? isBreachedPassword,
      appUrl: env.APP_URL,
   })

   if (env.TRUST_PROXY !== false) app.set('trust proxy', env.TRUST_PROXY)
   app.use(helmet())
   app.use(cors(corsOptions(env)))
   app.use(express.json({ limit: '100kb' }))
   if (env.NODE_ENV !== 'test') app.use(pinoHttp())

   // 200 only when the database answers, so Compose health checks are meaningful.
   app.get('/api/health', (_req, res) => {
      const connected = mongoose.connection.readyState === 1
      res.status(connected ? 200 : 503).json({
         status: connected ? 'ok' : 'unavailable',
         timestamp: new Date().toISOString(),
         database: connected ? 'connected' : 'disconnected',
      })
   })

   app.use('/api', csrfProtection)
   const invitations = createInvitationService({
      sendMail,
      appUrl: env.APP_URL,
      avatarDir: env.AVATAR_UPLOAD_DIR,
   })

   const households = createHouseholdService({ avatarDir: env.AVATAR_UPLOAD_DIR, recipeDir: env.RECIPE_UPLOAD_DIR })
   const calendar = createCalendarService()
   const ical = createIcalService({ calendar, appUrl: env.APP_URL })
   const shopping = createShoppingService()
   const account = createAccountService({ households, sessions, avatarDir: env.AVATAR_UPLOAD_DIR })

   const appOrigin = new URL(env.APP_URL)
   const passkeys = createPasskeyService({
      rpID: env.RP_ID ?? appOrigin.hostname,
      rpName: env.RP_NAME,
      origin: appOrigin.origin,
      appUrl: env.APP_URL,
      sendMail,
   })

   app.use('/api/auth/passkeys', createPasskeyRoutes(passkeys, sessions, limits.login))
   app.use('/api/auth', createAuthRoutes(auth, sessions, limits))
   app.use('/api/account', sessions.requireSession, createAccountRoutes(account, sessions))
   app.use('/api/users', sessions.requireSession, createUserSearchRoutes(limits.search))
   app.use(
      '/api/households',
      sessions.requireSession,
      createHouseholdRoutes(
         households,
         invitations,
         calendar,
         createReminderService(calendar),
         ical,
         shopping,
         createRecipeService({ shopping, calendar, imageDir: env.RECIPE_UPLOAD_DIR, ...(deps.allowFetchAddress ? { allowFetchAddress: deps.allowFetchAddress } : {}) }),
         limiter(IMPORT_RATE_LIMIT),
      ),
   )
   // Calendar apps fetch subscribed feeds without a session; the secret link is the key.
   app.use('/api/ical', createFeedRoutes(ical, limiter(FEED_RATE_LIMIT)))
   app.use('/api/invitations', createInvitationRoutes(invitations, sessions.requireSession, limits.token))
   app.use('/uploads/avatars', express.static(env.AVATAR_UPLOAD_DIR))
   app.use('/uploads/recipes', express.static(env.RECIPE_UPLOAD_DIR))

   app.use(notFound)
   app.use(errorHandler)

   return app
}
