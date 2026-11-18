/**
 * Guest / babysitter page: what a household writes down for visitors, and which of it a
 * secret link shows. Pure rules, no I/O.
 */

export const GUEST_SECTIONS = ['wifi', 'emergency', 'contacts', 'people', 'notes'] as const
export type GuestSection = (typeof GUEST_SECTIONS)[number]

/** QR / join-network security types (the `T:` field of a Wi-Fi QR code). */
export const WIFI_SECURITY = ['WPA', 'WEP', 'nopass'] as const
export type WifiSecurity = (typeof WIFI_SECURITY)[number]

export const GUEST_LIMITS = {
   links: 10,
   numbers: 10,
   contacts: 20,
   people: 12,
   notes: 30,
} as const

export type Wifi = { network: string; password: string; security: WifiSecurity; hidden: boolean }
export type EmergencyNumber = { label: string; number: string }
export type Emergency = { address: string; numbers: EmergencyNumber[]; pharmacy: string }
export type Contact = { name: string; relation: string; phone: string; note: string }
export type Person = { name: string; bedtime: string; meals: string; rules: string }
export type HouseNote = { title: string; text: string }

export type GuestContent = {
   wifi: Wifi | null
   emergency: Emergency
   contacts: Contact[]
   people: Person[]
   notes: HouseNote[]
}

/**
 * Germany's emergency numbers, prefilled until the household saves its own list:
 * 112 fire brigade and ambulance (EU-wide), 110 police.
 */
export const DEFAULT_EMERGENCY_NUMBERS: EmergencyNumber[] = [
   { label: 'Fire brigade & ambulance', number: '112' },
   { label: 'Police', number: '110' },
]

export const emptyGuestContent = (): GuestContent => ({
   wifi: null,
   emergency: { address: '', numbers: DEFAULT_EMERGENCY_NUMBERS.map((n) => ({ ...n })), pharmacy: '' },
   contacts: [],
   people: [],
   notes: [],
})

/** Whether a section has anything to show (empty sections are left off the guest page). */
export function hasContent(content: GuestContent, section: GuestSection): boolean {
   switch (section) {
      case 'wifi':
         return Boolean(content.wifi?.network)
      case 'emergency':
         return Boolean(content.emergency.address || content.emergency.pharmacy || content.emergency.numbers.length)
      case 'contacts':
         return content.contacts.length > 0
      case 'people':
         return content.people.length > 0
      case 'notes':
         return content.notes.length > 0
   }
}

/** What a link shows: only its sections, only those with content, always in page order. */
export function guestPageSections(content: GuestContent, linkSections: readonly GuestSection[]): Partial<GuestContent> {
   const page: Partial<GuestContent> = {}
   for (const section of GUEST_SECTIONS) {
      if (!linkSections.includes(section) || !hasContent(content, section)) continue
      if (section === 'wifi') page.wifi = content.wifi
      else if (section === 'emergency') page.emergency = content.emergency
      else if (section === 'contacts') page.contacts = content.contacts
      else if (section === 'people') page.people = content.people
      else page.notes = content.notes
   }
   return page
}

/** A link with an expiry stops working at that instant. */
export const isExpired = (expiresAt: Date | null, now: Date) => expiresAt !== null && expiresAt.getTime() <= now.getTime()

/**
 * Why a Wi-Fi password doesn't fit its security type, or null. WPA/WPA2/WPA3 passphrases are
 * 8–63 characters, or a 64-digit hex key (IEEE 802.11i); open networks have none.
 */
export function wifiPasswordProblem(security: WifiSecurity, password: string): string | null {
   if (security === 'nopass') return password ? 'An open network has no password.' : null
   if (!password) return 'Enter the Wi-Fi password.'
   if (security === 'WPA' && !/^[0-9a-fA-F]{64}$/.test(password) && (password.length < 8 || password.length > 63))
      return 'A WPA password has 8 to 63 characters.'
   if (password.length > 64) return 'The password is too long.'
   return null
}

/** SSIDs are at most 32 bytes (not characters: umlauts and emojis take more). */
export const ssidTooLong = (network: string) => new TextEncoder().encode(network).length > 32
