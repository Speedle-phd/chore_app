import path from 'node:path'
import { z } from 'zod'

const envSchema = z.object({
   NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
   PORT: z.coerce.number().int().positive().default(3000),
   MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
   /** Public URL of the web app: CORS origin and base for links in emails. */
   APP_URL: z.url().default('http://localhost:5173'),
   /**
    * Secure session cookie (`__Host-session`). Chromium and Firefox accept it on
    * http://localhost; set to false for plain-HTTP dev in Safari.
    */
   COOKIE_SECURE: z.stringbool().default(true),
   /**
    * Passkeys (WebAuthn): the site they belong to. Defaults to APP_URL's host
    * (e.g. localhost). Passkeys only work on this domain and its subdomains.
    */
   RP_ID: z.string().min(1).optional(),
   /**
    * Express "trust proxy": set when running behind a reverse proxy (e.g. 1 for
    * one proxy hop), so req.ip and rate limits use the visitor's real address.
    * Leave unset when clients connect directly; never trust headers blindly.
    */
   TRUST_PROXY: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v === '' || v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v)),
   RP_NAME: z.string().min(1).default('Hearth'),
   AVATAR_UPLOAD_DIR: z
      .string()
      .default(path.resolve(process.cwd(), 'uploads', 'avatars')),
   /** Internal URL of the mailer service (not reachable from outside Compose). */
   MAILER_URL: z.url().default('http://mailer:8000'),
   MAILER_KEY: z.string().min(32, 'MAILER_KEY must be at least 32 characters'),
})

export type Env = z.infer<typeof envSchema>

/** Validates the environment once at startup; fails fast with every problem listed. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
   const result = envSchema.safeParse(source)
   if (!result.success) {
      throw new Error(
         `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
      )
   }
   return result.data
}
