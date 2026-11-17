/// <reference types="node" />
// Reads index.css from disk: Vitest turns CSS imports (even `?raw`) into empty modules.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { THEMES, isTheme, themeMode } from './themes'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

/** Token names defined in a theme block (`.id {` or the `:root, .light {` block). */
function tokens(id: string): Set<string> {
   const block = new RegExp(`\\.${id} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? ''
   return new Set([...block.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]))
}

describe('themes', () => {
   // --radius is shared (defined once in :root), not a theme colour.
   const reference = new Set([...tokens('light')].filter((name) => name !== 'radius'))

   it.each(THEMES.map((t) => t.id))('%s defines every token the light theme defines', (id) => {
      expect(reference.size).toBeGreaterThan(30)
      expect([...reference].filter((name) => !tokens(id).has(name))).toEqual([])
   })

   it('lists exactly the dark themes in the dark variant and color-scheme rules', () => {
      const dark = THEMES.filter((t) => t.mode === 'dark').map((t) => t.id).sort()
      const variant = /@custom-variant dark \(&:is\(([^)]*)\)\)/.exec(css)?.[1] ?? ''
      expect([...variant.matchAll(/\.([a-z-]+) \*/g)].map((m) => m[1]).sort()).toEqual(dark)
      const scheme = /((?:html\.[a-z-]+,?\s*)+)\{\s*color-scheme: dark/.exec(css)?.[1] ?? ''
      expect([...scheme.matchAll(/html\.([a-z-]+)/g)].map((m) => m[1]).sort()).toEqual(dark)
   })

   it('accepts known themes and system, rejects removed or odd values', () => {
      expect(isTheme('moss')).toBe(true)
      expect(isTheme('system')).toBe(true)
      expect(isTheme('midnight-ocean')).toBe(false)
      expect(isTheme('plum-noir')).toBe(false)
      expect(isTheme(null)).toBe(false)
      expect(themeMode('graphite')).toBe('dark')
      expect(themeMode('linen')).toBe('light')
   })
})
