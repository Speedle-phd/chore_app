import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Membership, type Role } from '../models/membershipModel'
import { Redemption, Reward } from '../models/rewardModels'
import { realtime } from '../socket/realtime'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

// "Now" is Wednesday 25 March 2026, 12:00 in Berlin. The household is created now; the chores
// below start on 20 March, so points also come from occurrences older than the household.
const NOW = new Date('2026-03-25T11:00:00Z')

let app: ReturnType<typeof createApp>
let notices: ReturnType<typeof vi.spyOn>
beforeAll(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: NOW })
   app = createApp(
      loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'set-by-useTestDatabase', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: 'unused' }),
      {
         sendMail: async () => undefined,
         isBreached: async () => false,
         rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
      },
   )
   notices = vi.spyOn(realtime, 'householdChanged')
})
afterAll(() => vi.useRealTimers())
afterEach(() => {
   notices.mockClear()
   vi.setSystemTime(NOW)
})

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string) => request(app).get(url).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

/** A live 'rewards' notice went to this household (ids arrive as ObjectIds). */
const notified = (hid: string) => notices.mock.calls.some((call: unknown[]) => String(call[0]) === hid && call[1] === 'rewards')

type Balance = { earned: number; spent: number; reserved: number; available: number }
type RewardView = { id: string; title: string; cost: number; needsApproval: boolean; archivedAt: string | null }
type RedemptionView = { id: string; title: string; cost: number; memberId: string; requestedBy: string; status: string; decidedBy: string | null; note: string }
type Overview = {
   enabled: boolean
   rewards: RewardView[]
   archived: RewardView[]
   balances: Record<string, Balance>
   pending: RedemptionView[]
   history: RedemptionView[]
}

async function home() {
   const ownerUser = await signedInUser(app, 'Owner')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const ownerMid = (await Membership.findOne({ householdId: hid, userId: ownerUser.user._id }))?.id as string
   const base = `/api/households/${hid}`
   const rewards = `${base}/rewards`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      const m = await Membership.create({ householdId: hid, userId: person.user._id, role })
      return { ...as(person.cookie), mid: m.id as string }
   }
   const profile = async (fname: string) =>
      (await Membership.create({ householdId: hid, role: 'member', profile: { fname, lname: 'Kid' } })).id as string

   /** A daily chore (effort 5) for `memberId`, marked done on `days` dates from 20 March: 5 points each. */
   const earn = async (memberId: string, days: number) => {
      const item = (
         await owner.post(`${base}/calendar-items`, {
            kind: 'chore',
            title: `Chore for ${memberId.slice(-4)}`,
            allDay: false,
            start: '2026-03-20T19:00',
            end: '2026-03-20T19:30',
            timezone: 'Europe/Berlin',
            rrule: 'FREQ=DAILY',
            memberIds: [memberId],
            chore: { effort: 5, assignmentMode: 'anyone', rotation: false },
         })
      ).body
      const keys = Array.from({ length: days }, (_, i) => `2026-03-${String(20 + i).padStart(2, '0')}T19:00`)
      for (const key of keys) {
         const res = await owner.post(`${base}/calendar-items/${item.id}/occurrences/${encodeURIComponent(key)}/status`, { status: 'done', memberId })
         expect(res.status).toBe(204)
      }
      return { item, keys }
   }
   const reward = async (body: object) => (await owner.post(rewards, { title: 'Movie night pick', cost: 10, ...body })).body as RewardView
   const overview = async (who = owner) => (await who.get(rewards)).body as Overview
   notices.mockClear()
   return { hid, base, rewards, owner, ownerMid, join, profile, earn, reward, overview }
}

describe('rewards (managers)', () => {
   it('owners and admins add, edit, archive, restore and delete rewards; members and strangers can’t', async () => {
      const { rewards, owner, join, overview, hid } = await home()
      const admin = await join('admin')
      const member = await join('member')

      expect((await member.post(rewards, { title: 'Ice cream', cost: 5 })).status).toBe(403)
      expect((await owner.post(rewards, { title: 'Ice cream', cost: 0 })).status).toBe(400)
      expect((await owner.post(rewards, { title: ' ', cost: 5 })).status).toBe(400)
      expect((await owner.post(rewards, { title: 'Ice cream', cost: 1.5 })).status).toBe(400)

      const big = await admin.post(rewards, { title: '€2 pocket money', cost: 100, needsApproval: true })
      expect(big.status).toBe(201)
      expect(big.body).toMatchObject({ title: '€2 pocket money', cost: 100, needsApproval: true, archivedAt: null, description: '' })
      const small = (await owner.post(rewards, { title: 'Ice cream', cost: 5 })).body as RewardView
      expect(notified(hid)).toBe(true)

      // Members see the offer, cheapest first, but not archived ones.
      expect((await overview(member)).rewards.map((r) => r.title)).toEqual(['Ice cream', '€2 pocket money'])
      expect((await member.patch(`${rewards}/${small.id}`, { cost: 6 })).status).toBe(403)
      expect((await owner.patch(`${rewards}/${small.id}`, { cost: 6 })).body.cost).toBe(6)
      expect((await owner.patch(`${rewards}/${small.id}`, {})).status).toBe(400)

      expect((await member.post(`${rewards}/${small.id}/archive`)).status).toBe(403)
      expect((await owner.post(`${rewards}/${small.id}/archive`)).body.archivedAt).not.toBeNull()
      expect((await overview(member)).rewards.map((r) => r.title)).toEqual(['€2 pocket money'])
      expect((await overview(member)).archived).toEqual([])
      expect((await overview()).archived.map((r) => r.title)).toEqual(['Ice cream'])
      expect((await owner.post(`${rewards}/${small.id}/restore`)).body.archivedAt).toBeNull()

      expect((await member.del(`${rewards}/${small.id}`)).status).toBe(403)
      expect((await owner.del(`${rewards}/${small.id}`)).status).toBe(204)
      expect(await Reward.exists({ _id: small.id })).toBeNull()

      // Strangers and unknown ids.
      const stranger = as((await signedInUser(app, 'Stranger')).cookie)
      expect((await stranger.get(rewards)).status).toBe(404)
      expect((await owner.patch(`${rewards}/000000000000000000000000`, { cost: 3 })).status).toBe(404)
      expect((await owner.patch(`${rewards}/not-an-id`, { cost: 3 })).status).toBe(404)
   })

   it('a reward someone asked for can’t be deleted (archive instead); earlier requests keep title and cost', async () => {
      const { rewards, owner, ownerMid, earn, reward, overview } = await home()
      await earn(ownerMid, 2)
      const r = await reward({ cost: 4 })
      expect((await owner.post(`${rewards}/${r.id}/redeem`)).status).toBe(201)
      const del = await owner.del(`${rewards}/${r.id}`)
      expect(del.status).toBe(409)
      expect(del.body.message).toMatch(/Archive it instead/)
      await owner.patch(`${rewards}/${r.id}`, { title: 'Renamed', cost: 9 })
      expect((await overview()).history[0]).toMatchObject({ title: 'Movie night pick', cost: 4 })
   })
})

describe('spending points', () => {
   it('earned points come from chores (also ones older than the household); a reward without approval is granted at once', async () => {
      const { rewards, owner, ownerMid, earn, reward, overview, hid } = await home()
      expect((await overview()).balances[ownerMid]).toEqual({ earned: 0, spent: 0, reserved: 0, available: 0 })
      await earn(ownerMid, 2) // 20 and 21 March, before the household existed
      expect((await overview()).balances[ownerMid]).toEqual({ earned: 10, spent: 0, reserved: 0, available: 10 })

      const r = await reward({ cost: 6 })
      notices.mockClear()
      const res = await owner.post(`${rewards}/${r.id}/redeem`)
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ title: 'Movie night pick', cost: 6, memberId: ownerMid, requestedBy: ownerMid, status: 'approved' })
      expect(notified(hid)).toBe(true)
      expect((await overview()).balances[ownerMid]).toEqual({ earned: 10, spent: 6, reserved: 0, available: 4 })

      const again = await owner.post(`${rewards}/${r.id}/redeem`)
      expect(again.status).toBe(409)
      expect(again.body.message).toBe('Not enough points: 4 of 6.')
      expect(await Redemption.countDocuments({ rewardId: r.id })).toBe(1)
   })

   it('rewards that need approval wait (points reserved); managers approve, decline or refund; the person can cancel', async () => {
      const { rewards, owner, earn, reward, overview, join } = await home()
      const member = await join('member')
      const other = await join('member')
      await earn(member.mid, 4) // 20 points
      const r = await reward({ cost: 8, needsApproval: true })

      const asked = await member.post(`${rewards}/${r.id}/redeem`)
      expect(asked.body.status).toBe('pending')
      expect((await overview(member)).balances[member.mid]).toEqual({ earned: 20, spent: 0, reserved: 8, available: 12 })
      expect((await overview(member)).pending.map((p) => p.id)).toEqual([asked.body.id])
      expect((await overview()).pending.map((p) => p.id)).toEqual([asked.body.id])

      // Only managers decide; another member can't even see it.
      expect((await member.post(`${rewards}/redemptions/${asked.body.id}/approve`)).status).toBe(403)
      expect((await other.post(`${rewards}/redemptions/${asked.body.id}/cancel`)).status).toBe(404)
      expect((await overview(other)).pending).toEqual([])

      const approved = await owner.post(`${rewards}/redemptions/${asked.body.id}/approve`, { note: 'Enjoy!' })
      expect(approved.body).toMatchObject({ status: 'approved', note: 'Enjoy!' })
      expect((await owner.post(`${rewards}/redemptions/${asked.body.id}/approve`)).status).toBe(409)
      expect((await member.post(`${rewards}/redemptions/${asked.body.id}/cancel`)).status).toBe(409)
      expect((await overview(member)).balances[member.mid]).toMatchObject({ spent: 8, reserved: 0, available: 12 })

      // Declined: points come back.
      const second = (await member.post(`${rewards}/${r.id}/redeem`)).body
      expect((await owner.post(`${rewards}/redemptions/${second.id}/decline`, { note: 'Not this week' })).body.status).toBe('declined')
      expect((await overview(member)).balances[member.mid]).toMatchObject({ spent: 8, reserved: 0, available: 12 })

      // Cancelled by the person: points come back.
      const third = (await member.post(`${rewards}/${r.id}/redeem`)).body
      expect((await member.post(`${rewards}/redemptions/${third.id}/cancel`)).body.status).toBe('cancelled')
      expect((await overview(member)).balances[member.mid]).toMatchObject({ reserved: 0, available: 12 })

      // Refund of an approved one (managers): spent goes back.
      expect((await member.post(`${rewards}/redemptions/${asked.body.id}/refund`)).status).toBe(403)
      expect((await owner.post(`${rewards}/redemptions/${asked.body.id}/refund`)).body.status).toBe('refunded')
      expect((await overview(member)).balances[member.mid]).toEqual({ earned: 20, spent: 0, reserved: 0, available: 20 })
      expect((await overview(member)).history.map((h) => h.status).sort()).toEqual(['cancelled', 'declined', 'refunded'])
   })

   it('a manager’s own request for a reward that needs approval is granted at once', async () => {
      const { rewards, ownerMid, owner, earn, reward } = await home()
      await earn(ownerMid, 2)
      const r = await reward({ cost: 5, needsApproval: true })
      expect((await owner.post(`${rewards}/${r.id}/redeem`)).body.status).toBe('approved')
   })

   it('profiles’ points are spent by managers only; nobody spends another account’s points', async () => {
      const { rewards, owner, ownerMid, earn, reward, profile, join, overview } = await home()
      const kid = await profile('Mia')
      const member = await join('member')
      await earn(kid, 2)
      await earn(member.mid, 2)
      const r = await reward({ cost: 5, needsApproval: true })

      const byMember = await member.post(`${rewards}/${r.id}/redeem`, { memberId: kid })
      expect(byMember.status).toBe(403)
      expect(byMember.body.message).toMatch(/profile/)
      expect((await owner.post(`${rewards}/${r.id}/redeem`, { memberId: member.mid })).status).toBe(403)
      expect((await member.post(`${rewards}/${r.id}/redeem`, { memberId: ownerMid })).status).toBe(403)
      expect((await owner.post(`${rewards}/${r.id}/redeem`, { memberId: '000000000000000000000000' })).status).toBe(400)

      const forKid = await owner.post(`${rewards}/${r.id}/redeem`, { memberId: kid })
      expect(forKid.body).toMatchObject({ memberId: kid, requestedBy: ownerMid, status: 'approved' })
      // Managers see everyone's balance; members only their own.
      expect((await overview()).balances[kid]).toMatchObject({ earned: 10, spent: 5, available: 5 })
      expect(Object.keys((await overview(member)).balances)).toEqual([member.mid])
   })

   it('two requests at the same moment can’t overspend: one is granted, the other refused', async () => {
      const { rewards, owner, ownerMid, earn, reward, overview } = await home()
      await earn(ownerMid, 2) // 10 points
      const r = await reward({ cost: 6 })
      const results = await Promise.all([owner.post(`${rewards}/${r.id}/redeem`), owner.post(`${rewards}/${r.id}/redeem`)])
      expect(results.map((x) => x.status).sort()).toEqual([201, 409])
      expect((await overview()).balances[ownerMid]).toMatchObject({ spent: 6, available: 4 })
      expect(await Redemption.countDocuments({ rewardId: r.id })).toBe(1)
   })

   it('undoing a chore after spending can make the balance negative: new requests are refused, nothing is taken back', async () => {
      const { base, rewards, owner, ownerMid, earn, reward, overview } = await home()
      const { item, keys } = await earn(ownerMid, 2) // 10 points
      const r = await reward({ cost: 8 })
      await owner.post(`${rewards}/${r.id}/redeem`)
      const undo = await owner.post(`${base}/calendar-items/${item.id}/occurrences/${encodeURIComponent(keys[1] as string)}/status`, { status: 'open', memberId: ownerMid })
      expect(undo.status).toBe(204)
      expect((await overview()).balances[ownerMid]).toEqual({ earned: 5, spent: 8, reserved: 0, available: -3 })
      const cheap = await reward({ title: 'Sticker', cost: 1 })
      const refused = await owner.post(`${rewards}/${cheap.id}/redeem`)
      expect(refused.status).toBe(409)
      expect(refused.body.message).toBe('Not enough points: 0 of 1.')
      expect((await overview()).history[0]?.status).toBe('approved')
   })

   it('archived rewards and a household with rewards switched off take no requests', async () => {
      const { base, rewards, owner, ownerMid, earn, reward, overview } = await home()
      await earn(ownerMid, 2)
      const r = await reward({ cost: 2 })
      await owner.post(`${rewards}/${r.id}/archive`)
      expect((await owner.post(`${rewards}/${r.id}/redeem`)).status).toBe(409)
      await owner.post(`${rewards}/${r.id}/restore`)

      expect((await owner.patch(`${base}/motivation`, { rewards: false })).body.motivation.rewards).toBe(false)
      expect((await overview()).enabled).toBe(false)
      const off = await owner.post(`${rewards}/${r.id}/redeem`)
      expect(off.status).toBe(409)
      expect(off.body.message).toMatch(/switched off/)
      await owner.patch(`${base}/motivation`, { rewards: true })
      expect((await owner.post(`${rewards}/${r.id}/redeem`)).status).toBe(201)
   })
})

describe('deleting the household', () => {
   it('removes its rewards and requests', async () => {
      const { base, rewards, owner, ownerMid, earn, reward, hid } = await home()
      await earn(ownerMid, 1)
      const r = await reward({ cost: 2 })
      await owner.post(`${rewards}/${r.id}/redeem`)
      expect((await owner.del(base)).status).toBe(204)
      expect(await Reward.countDocuments({ householdId: hid })).toBe(0)
      expect(await Redemption.countDocuments({ householdId: hid })).toBe(0)
   })
})

describe('member view', () => {
   it('shows a member’s balance and latest requests to themselves and managers only', async () => {
      const { rewards, owner, earn, reward, join } = await home()
      const member = await join('member')
      const other = await join('member')
      await earn(member.mid, 2)
      const r = await reward({ cost: 3 })
      await member.post(`${rewards}/${r.id}/redeem`)

      const mine = await member.get(`${rewards}/members/${member.mid}`)
      expect(mine.body.balance).toEqual({ earned: 10, spent: 3, reserved: 0, available: 7 })
      expect(mine.body.recent.map((x: RedemptionView) => x.title)).toEqual(['Movie night pick'])
      expect((await owner.get(`${rewards}/members/${member.mid}`)).status).toBe(200)
      expect((await other.get(`${rewards}/members/${member.mid}`)).status).toBe(403)
      expect((await owner.get(`${rewards}/members/000000000000000000000000`)).status).toBe(404)
      expect((await owner.get(`${rewards}/members/nope`)).status).toBe(400)
   })
})
