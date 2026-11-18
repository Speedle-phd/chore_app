import type { RefObject } from 'react'
import { insertAt } from './emoji'

/**
 * Picking an emoji puts it at the caret of `field` (replacing a selection), then focus and the
 * caret go back there, so writing just continues. Focus waits a frame: the picker's popover
 * hands focus back to its button when it closes.
 */
export function useInsertEmoji(field: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, value: string, setValue: (next: string) => void) {
   return (emoji: string) => {
      const el = field.current
      const next = insertAt(value, el?.selectionStart ?? null, el?.selectionEnd ?? null, emoji)
      setValue(next.value)
      requestAnimationFrame(() => {
         el?.focus()
         el?.setSelectionRange(next.caret, next.caret)
      })
   }
}
