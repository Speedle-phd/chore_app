import { createHash } from 'node:crypto'
import { hash, verify, type Algorithm } from '@node-rs/argon2'

// Source: OWASP Password Storage Cheat Sheet (Argon2id, m=19 MiB, t=2, p=1).
const ARGON2_OPTIONS = {
   // Algorithm.Argon2id; a const enum can't be imported under isolatedModules.
   algorithm: 2 as Algorithm,
   memoryCost: 19_456,
   timeCost: 2,
   parallelism: 1,
} as const
const CURRENT_PARAMS_PREFIX = '$argon2id$v=19$m=19456,t=2,p=1$'

// Source: NIST SP 800-63B-4 §3.1.1.2 (single-factor passwords: at least 15
// characters, allow at least 64, no composition rules, blocklist check).
export const PASSWORD_MIN_LENGTH = 15
export const PASSWORD_MAX_LENGTH = 128

export const hashPassword = (password: string) =>
   hash(password, ARGON2_OPTIONS)

export const verifyPassword = (passwordHash: string, password: string) =>
   verify(passwordHash, password)

export const needsRehash = (passwordHash: string) =>
   !passwordHash.startsWith(CURRENT_PARAMS_PREFIX)

// Verifying against a fixed hash makes "unknown email" cost the same time as
// "wrong password", so response timing doesn't reveal which accounts exist.
let dummyHash: Promise<string> | null = null
export async function dummyVerify(password: string) {
   dummyHash ??= hashPassword('dummy-password-for-timing-only')
   await verifyPassword(await dummyHash, password)
}

export type BreachCheck = (password: string) => Promise<boolean>

/**
 * Have I Been Pwned range API (k-anonymity): only the first 5 hex characters
 * of the SHA-1 leave the server. Fails open on outages, logged so the gap is
 * visible.
 */
export const isBreachedPassword: BreachCheck = async (password) => {
   const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
   try {
      const response = await fetch(
         `https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`,
         {
            headers: { 'Add-Padding': 'true' },
            signal: AbortSignal.timeout(2000),
         },
      )
      if (!response.ok) {
         console.warn(`Breached-password check unavailable (${response.status})`)
         return false
      }
      const suffix = sha1.slice(5)
      return (await response.text())
         .split('\n')
         .some(
            (line) => line.startsWith(suffix) && !line.trim().endsWith(':0'),
         )
   } catch (error) {
      console.warn('Breached-password check failed:', (error as Error).message)
      return false
   }
}

/** Returns human-readable problems; an empty list means the password is acceptable. */
export async function passwordProblems(
   password: string,
   context: string[],
   isBreached: BreachCheck,
): Promise<string[]> {
   const length = [...password].length
   const problems: string[] = []
   if (length < PASSWORD_MIN_LENGTH)
      problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
   if (length > PASSWORD_MAX_LENGTH)
      problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`)
   const lower = password.toLowerCase()
   if (
      context.some(
         (word) => word.length >= 4 && lower.includes(word.toLowerCase()),
      )
   ) {
      problems.push('Don’t use your name, email or the app name.')
   }
   if (problems.length === 0 && (await isBreached(password))) {
      problems.push(
         'This password appeared in a data breach. Please choose another one.',
      )
   }
   return problems
}

/** Words a password must not contain: app name, names and the email's local part. */
export function passwordContext(user: {
   email: string
   fname?: string
   lname?: string
}) {
   return [
      'hearth',
      user.email.split('@')[0] ?? '',
      user.fname ?? '',
      user.lname ?? '',
   ]
}
