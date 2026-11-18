import { GUEST_SECTIONS, type GuestContent, type GuestSection, type Wifi } from './types'

/**
 * The text of a "join this Wi-Fi" QR code, the format phone cameras understand (Android, iOS 11+):
 * `WIFI:T:<WPA|WEP|nopass>;S:<name>;P:<password>;H:true;;`. Backslash, semicolon, comma, colon and
 * double quote in the name and password are escaped with a backslash.
 * Source: ZXing "Barcode Contents" (Wi-Fi network config), the de-facto standard; Wi-Fi Alliance
 * WPA3 specification v3, "URI format" uses the same fields.
 */
export function wifiQrText(wifi: Pick<Wifi, 'network' | 'password' | 'security' | 'hidden'>): string {
   const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1')
   const password = wifi.security === 'nopass' ? '' : `P:${esc(wifi.password)};`
   return `WIFI:T:${wifi.security};S:${esc(wifi.network)};${password}${wifi.hidden ? 'H:true;' : ''};`
}

/** `tel:` address for a phone number as people write it ("+49 (0)30 123-45" → "tel:+4930 12345" without spaces). */
export function telHref(phone: string): string {
   // "(0)" after a country code is not dialled.
   const cleaned = phone.replace(/^(\+\d{1,3})\s*\(0\)/, '$1')
   return `tel:${cleaned.replace(/[^+0-9]/g, '')}`
}

/** The end of a chosen local day as an instant (links stay valid through that whole day). */
export const endOfDay = (date: string) => new Date(`${date}T23:59:59.999`).toISOString()
/** Back from an instant to the local date for the date picker. */
export function localDate(iso: string): string {
   const d = new Date(iso)
   const pad = (n: number) => String(n).padStart(2, '0')
   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const SECTION_NAMES: Record<string, string> = {
   wifi: 'Wi-Fi',
   'emergency.numbers': 'Emergency number',
   emergency: 'Emergency',
   contacts: 'Contact',
   people: 'Person',
   notes: 'House note',
}

/**
 * Turns the server's validation details ("contacts.0.phone: Phone: only digits…") into
 * something people can act on ("Contact 1: Phone: only digits…").
 */
export function readableProblem(detail: string): string {
   const match = /^([a-z.]+?)(?:\.(\d+))?(?:\.[a-zA-Z]+)?: (.*)$/.exec(detail)
   if (!match) return detail
   const [, path = '', index, message = ''] = match
   const name = SECTION_NAMES[path]
   if (!name) return message
   return index === undefined ? `${name}: ${message}` : `${name} ${Number(index) + 1}: ${message}`
}

/** Mirror of the server's rule (domain/guest.ts): a section shows only when it has something in it. */
export function filledSections(content: GuestContent, only: readonly GuestSection[] = GUEST_SECTIONS): Partial<GuestContent> {
   const page: Partial<GuestContent> = {}
   if (only.includes('wifi') && content.wifi?.network) page.wifi = content.wifi
   const e = content.emergency
   if (only.includes('emergency') && (e.address || e.pharmacy || e.numbers.length)) page.emergency = e
   if (only.includes('contacts') && content.contacts.length) page.contacts = content.contacts
   if (only.includes('people') && content.people.length) page.people = content.people
   if (only.includes('notes') && content.notes.length) page.notes = content.notes
   return page
}

/** Plan / user decision: no health section, and the free-text fields say why. */
export const PRIVACY_HINT = 'Anyone with the link can read this. Don’t add health information such as allergies or medication.'

/** WPA passphrases are 8–63 characters or a 64-digit hex key (same rule as the server). */
export const wifiPasswordShort = (w: Pick<Wifi, 'security' | 'password'>) =>
   w.security === 'WPA' && w.password.length > 0 && !/^[0-9a-fA-F]{64}$/.test(w.password) && (w.password.length < 8 || w.password.length > 63)

/** Before saving: a Wi-Fi without a name is no Wi-Fi (and an open network sends no password). */
export function normalizeContent(c: GuestContent): GuestContent {
   const w = c.wifi
   const wifi = !w || (!w.network.trim() && !w.password) ? null : { ...w, password: w.security === 'nopass' ? '' : w.password }
   return { ...c, wifi }
}
