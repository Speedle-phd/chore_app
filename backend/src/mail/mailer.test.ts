import { describe, expect, it, vi } from 'vitest'
import { createMailer, MailDeliveryError } from './mailer'

const env = { MAILER_URL: 'http://mailer:8000', MAILER_KEY: 'k'.repeat(32) }

describe('createMailer', () => {
   it('posts template, recipient and data with the shared key', async () => {
      const fetchMock = vi.fn(async () => new Response(null, { status: 202 }))
      await createMailer(env, fetchMock)('test', 'a@b.test', { name: 'Ann' })

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
      expect(String(url)).toBe('http://mailer:8000/send')
      expect(init.method).toBe('POST')
      expect((init.headers as Record<string, string>)['X-Mailer-Key']).toBe(
         env.MAILER_KEY,
      )
      expect(JSON.parse(String(init.body))).toEqual({
         template: 'test',
         to: 'a@b.test',
         data: { name: 'Ann' },
      })
   })

   it("surfaces the mailer's error message and status", async () => {
      const fetchMock = vi.fn(async () =>
         Response.json({ message: 'Missing data: name' }, { status: 400 }),
      )
      const send = createMailer(env, fetchMock)
      await expect(send('test', 'a@b.test', {})).rejects.toMatchObject({
         name: 'MailDeliveryError',
         message: 'Missing data: name',
         status: 400,
      })
   })

   it('reports an unreachable mailer as a delivery error', async () => {
      const fetchMock = vi.fn(async () => {
         throw new TypeError('fetch failed')
      })
      await expect(
         createMailer(env, fetchMock)('test', 'a@b.test', { name: 'A' }),
      ).rejects.toBeInstanceOf(MailDeliveryError)
   })
})
