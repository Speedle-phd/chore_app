import { StatusCodes } from 'http-status-codes'
import { isValidObjectId } from 'mongoose'
import { randomToken, sha256 } from '../auth/crypto'
import { emptyGuestContent, GUEST_LIMITS, guestPageSections, isExpired, type GuestContent, type GuestSection } from '../domain/guest'
import { AppError, BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors'
import { canManage } from '../households/permissions'
import { GuestInfo, GuestLink, type GuestInfoType, type GuestLinkType } from '../models/guestModels'
import { Household } from '../models/householdModel'
import type { MembershipType } from '../models/membershipModel'
import { realtime } from '../socket/realtime'

/** Don't write "last opened" on every visit (a guest may reload often). */
const LAST_OPENED_RESOLUTION_MS = 60_000

export type GuestInfoView = GuestContent & { updatedAt: string | null }
export type GuestLinkView = {
   id: string
   label: string
   sections: GuestSection[]
   expiresAt: string | null
   expired: boolean
   issuedAt: string
   lastOpenedAt: string | null
   createdAt: string
}
/** Only returned when a link is created or replaced: the token can't be shown again. */
export type NewGuestLinkView = GuestLinkView & { url: string }
/** What a guest sees: the household's name and the link's sections that have content. */
export type GuestPageView = { household: string; label: string; sections: Partial<GuestContent>; updatedAt: string | null }

function content(info: GuestInfoType | null): GuestContent {
   if (!info) return emptyGuestContent()
   const w = info.wifi
   return {
      wifi: w ? { network: w.network, password: w.password, security: w.security, hidden: w.hidden } : null,
      emergency: {
         address: info.emergency?.address ?? '',
         numbers: (info.emergency?.numbers ?? []).map((n) => ({ label: n.label, number: n.number })),
         pharmacy: info.emergency?.pharmacy ?? '',
      },
      contacts: info.contacts.map((c) => ({ name: c.name, relation: c.relation, phone: c.phone, note: c.note })),
      people: info.people.map((p) => ({ name: p.name, bedtime: p.bedtime, meals: p.meals, rules: p.rules })),
      notes: info.notes.map((n) => ({ title: n.title, text: n.text })),
   }
}

const infoView = (info: GuestInfoType | null): GuestInfoView => ({ ...content(info), updatedAt: info?.updatedAt.toISOString() ?? null })

const linkView = (link: GuestLinkType, now: Date): GuestLinkView => ({
   id: link.id as string,
   label: link.label,
   sections: link.sections as GuestSection[],
   expiresAt: link.expiresAt?.toISOString() ?? null,
   expired: isExpired(link.expiresAt ?? null, now),
   issuedAt: link.issuedAt.toISOString(),
   lastOpenedAt: link.lastOpenedAt?.toISOString() ?? null,
   createdAt: link.createdAt.toISOString(),
})

function managersOnly(me: MembershipType) {
   if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can change the guest page.')
}

function futureOrNull(expiresAt: Date | null, now: Date) {
   if (expiresAt && expiresAt.getTime() <= now.getTime()) throw new BadRequestError('The expiry date is in the past.')
   return expiresAt
}

export function createGuestService({ appUrl }: { appUrl: string }) {
   const pageUrl = (token: string) => new URL(`/guest/${token}`, appUrl).toString()

   async function ownLink(me: MembershipType, id: string) {
      const link = isValidObjectId(id) ? await GuestLink.findOne({ _id: id, householdId: me.householdId }) : null
      if (!link) throw new NotFoundError('Link not found')
      return link
   }

   return {
      /** Every member may read it (it's their home's info); only managers edit. */
      async getInfo(me: MembershipType): Promise<GuestInfoView> {
         return infoView(await GuestInfo.findOne({ householdId: me.householdId }))
      },

      async saveInfo(me: MembershipType, input: GuestContent): Promise<GuestInfoView> {
         managersOnly(me)
         const info = await GuestInfo.findOneAndUpdate(
            { householdId: me.householdId },
            { $set: { ...input, updatedBy: me._id } },
            { upsert: true, returnDocument: 'after', runValidators: true },
         )
         realtime.householdChanged(me.householdId, 'guest')
         return infoView(info)
      },

      async listLinks(me: MembershipType, now: Date): Promise<GuestLinkView[]> {
         managersOnly(me)
         const links = await GuestLink.find({ householdId: me.householdId }).sort({ _id: 1 })
         return links.map((l) => linkView(l, now))
      },

      async createLink(
         me: MembershipType,
         input: { label: string; sections: GuestSection[]; expiresAt: Date | null },
         now: Date,
      ): Promise<NewGuestLinkView> {
         managersOnly(me)
         if ((await GuestLink.countDocuments({ householdId: me.householdId })) >= GUEST_LIMITS.links)
            throw new ConflictError(`At most ${GUEST_LIMITS.links} guest links. Remove one first.`)
         const token = randomToken()
         const link = await GuestLink.create({
            householdId: me.householdId,
            label: input.label,
            sections: input.sections,
            expiresAt: futureOrNull(input.expiresAt, now),
            tokenHash: sha256(token),
            issuedAt: now,
            createdBy: me._id,
         })
         realtime.householdChanged(me.householdId, 'guest')
         return { ...linkView(link, now), url: pageUrl(token) }
      },

      async updateLink(
         me: MembershipType,
         id: string,
         patch: { label?: string | undefined; sections?: GuestSection[] | undefined; expiresAt?: Date | null | undefined },
         now: Date,
      ): Promise<GuestLinkView> {
         managersOnly(me)
         const link = await ownLink(me, id)
         if (patch.label !== undefined) link.label = patch.label
         if (patch.sections !== undefined) link.sections = patch.sections
         if (patch.expiresAt !== undefined) link.expiresAt = futureOrNull(patch.expiresAt, now)
         await link.save()
         realtime.householdChanged(me.householdId, 'guest')
         return linkView(link, now)
      },

      /** New secret for the same link: the old address stops working. */
      async replaceLink(me: MembershipType, id: string, now: Date): Promise<NewGuestLinkView> {
         managersOnly(me)
         const link = await ownLink(me, id)
         const token = randomToken()
         link.tokenHash = sha256(token)
         link.issuedAt = now
         link.lastOpenedAt = null
         await link.save()
         realtime.householdChanged(me.householdId, 'guest')
         return { ...linkView(link, now), url: pageUrl(token) }
      },

      async removeLink(me: MembershipType, id: string) {
         managersOnly(me)
         const link = await ownLink(me, id)
         await link.deleteOne()
         realtime.householdChanged(me.householdId, 'guest')
      },

      /** The public page behind a link. Unknown/revoked → 404, expired → 410 (still no data). */
      async page(token: string, now: Date): Promise<GuestPageView> {
         const link = await GuestLink.findOne({ tokenHash: sha256(token) })
         const household = link && (await Household.findById(link.householdId).select('name').lean())
         if (!link || !household) throw new NotFoundError('This link doesn’t work (any more).')
         if (isExpired(link.expiresAt ?? null, now)) throw new AppError('This link has expired.', StatusCodes.GONE, 'LINK_EXPIRED')

         const info = await GuestInfo.findOne({ householdId: link.householdId })
         if (!link.lastOpenedAt || now.getTime() - link.lastOpenedAt.getTime() > LAST_OPENED_RESOLUTION_MS) {
            await GuestLink.updateOne({ _id: link._id }, { $set: { lastOpenedAt: now } })
         }
         return {
            household: household.name,
            label: link.label,
            sections: guestPageSections(content(info), link.sections as GuestSection[]),
            updatedAt: info?.updatedAt.toISOString() ?? null,
         }
      },
   }
}

export type GuestService = ReturnType<typeof createGuestService>
