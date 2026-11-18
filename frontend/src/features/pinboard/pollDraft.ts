/**
 * The option fields of a poll being written. There is always one empty field at the end while
 * there's room (so nobody needs an "add" button); fields in between may be empty while typing.
 */

/** Same limit as the server (domain/pinboard.ts). */
export const MAX_OPTIONS = 10
const MIN_FIELDS = 2

/** Keeps exactly one empty field at the end (unless full), never fewer than two fields. */
function withDraft(options: string[]): string[] {
   const out = [...options]
   while (out.length > MIN_FIELDS && out[out.length - 1] === '' && out[out.length - 2] === '') out.pop()
   if (out.length < MAX_OPTIONS && out[out.length - 1] !== '') out.push('')
   while (out.length < MIN_FIELDS) out.push('')
   return out
}

export const editOption = (options: string[], i: number, value: string) => withDraft(options.map((o, j) => (j === i ? value : o)))

export const removeOption = (options: string[], i: number) => withDraft(options.filter((_, j) => j !== i))

/** Swap with the neighbour above (-1) or below (+1); the empty draft field stays last. */
export function moveOption(options: string[], i: number, by: -1 | 1): string[] {
   const j = i + by
   if (j < 0 || j >= options.length || options[i]?.trim() === '' || options[j]?.trim() === '') return options
   const out = [...options]
   ;[out[i], out[j]] = [out[j] as string, out[i] as string]
   return out
}

/** What gets sent: trimmed, non-empty, in order. */
export const cleanOptions = (options: string[]) => options.map((o) => o.trim()).filter(Boolean)
