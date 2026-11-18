/** Server: backend/src/domain/guest.ts and guest/guestService.ts */
export const GUEST_SECTIONS = ['wifi', 'emergency', 'contacts', 'people', 'notes'] as const
export type GuestSection = (typeof GUEST_SECTIONS)[number]
export const SECTION_LABEL: Record<GuestSection, string> = {
   wifi: 'Wi-Fi',
   emergency: 'Emergency',
   contacts: 'Contacts',
   people: 'People & routines',
   notes: 'House notes',
}
export const GUEST_LIMITS = { links: 10, numbers: 10, contacts: 20, people: 12, notes: 30 } as const

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass'
export type Wifi = { network: string; password: string; security: WifiSecurity; hidden: boolean }
export type EmergencyNumber = { label: string; number: string }
export type Contact = { name: string; relation: string; phone: string; note: string }
export type Person = { name: string; bedtime: string; meals: string; rules: string }
export type HouseNote = { title: string; text: string }
export type GuestContent = {
   wifi: Wifi | null
   emergency: { address: string; numbers: EmergencyNumber[]; pharmacy: string }
   contacts: Contact[]
   people: Person[]
   notes: HouseNote[]
}
export type GuestInfo = GuestContent & { updatedAt: string | null }

export type GuestLink = {
   id: string
   label: string
   sections: GuestSection[]
   expiresAt: string | null
   expired: boolean
   issuedAt: string
   lastOpenedAt: string | null
   createdAt: string
}
/** Only returned when a link is made or replaced: the server keeps just a hash. */
export type NewGuestLink = GuestLink & { url: string }
export type LinkInput = { label: string; sections: GuestSection[]; expiresAt: string | null }

/** What a guest sees. */
export type GuestPage = { household: string; label: string; sections: Partial<GuestContent>; updatedAt: string | null }
