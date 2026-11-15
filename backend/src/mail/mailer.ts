import type { Env } from '../config/env'

/** Template names known to the mailer service (mailer/templates_registry.py). */
export type MailTemplate =
   | 'test'
   | 'verify_email'
   | 'reset_password'
   | 'account_exists'
   | 'password_changed'
   | 'invitation'
   | 'passkey_added'
   | 'passkey_removed'
   | 'reminder_digest'

export type SendMail = (
   template: MailTemplate,
   to: string,
   data: Record<string, unknown>,
) => Promise<void>

export class MailDeliveryError extends Error {
   constructor(
      message: string,
      public readonly status?: number,
   ) {
      super(message)
      this.name = 'MailDeliveryError'
   }
}

/** Client for the internal mailer service. Only the backend talks to it. */
export function createMailer(
   env: Pick<Env, 'MAILER_URL' | 'MAILER_KEY'>,
   fetchImpl: typeof fetch = fetch,
): SendMail {
   return async (template, to, data) => {
      let response: Response
      try {
         response = await fetchImpl(new URL('/send', env.MAILER_URL), {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               'X-Mailer-Key': env.MAILER_KEY,
            },
            body: JSON.stringify({ template, to, data }),
            signal: AbortSignal.timeout(10_000),
         })
      } catch (error) {
         throw new MailDeliveryError(
            `Mailer unreachable: ${error instanceof Error ? error.message : String(error)}`,
         )
      }
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as {
            message?: string
         } | null
         throw new MailDeliveryError(
            body?.message ?? `Mailer responded with ${response.status}`,
            response.status,
         )
      }
   }
}
