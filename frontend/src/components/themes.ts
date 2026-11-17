/**
 * The colour themes. Each id is a class on <html> with its tokens in index.css; dark ones
 * must also be listed in index.css's `@custom-variant dark` and `color-scheme: dark` rules.
 */
export const THEMES = [
   { id: 'light', label: 'Light', mode: 'light' },
   { id: 'linen', label: 'Linen', mode: 'light' },
   { id: 'fjord', label: 'Fjord', mode: 'light' },
   { id: 'dark', label: 'Dark', mode: 'dark' },
   { id: 'ember', label: 'Ember', mode: 'dark' },
   { id: 'graphite', label: 'Graphite', mode: 'dark' },
   { id: 'moss', label: 'Moss', mode: 'dark' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type Theme = ThemeId | 'system'
export type ThemeMode = 'light' | 'dark'

export function isTheme(value: unknown): value is Theme {
   return value === 'system' || THEMES.some((t) => t.id === value)
}

export function themeMode(theme: ThemeId): ThemeMode {
   return THEMES.find((t) => t.id === theme)?.mode ?? 'light'
}
