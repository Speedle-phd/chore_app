/** Non-empty trimmed lines (ingredients: one per line). */
export const splitLines = (text: string) =>
   text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

/** Steps: separated by an empty line; single line breaks inside a step are kept. */
export const splitSteps = (text: string) =>
   text
      .split(/\r?\n\s*\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
