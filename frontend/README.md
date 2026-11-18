# Hearth — frontend

React 19 + Vite + TypeScript client. Data from the API (`/api`, proxied by Vite in development and by Caddy in production) through TanStack Query; live updates over Socket.IO refresh the matching queries. Project overview: [../README.md](../README.md); state, architecture and decisions: [../docs/HANDOFF.md](../docs/HANDOFF.md).

## Scripts

```bash
npx tsc -b          # typecheck
npx oxlint src      # lint (6 known warnings in shadcn/theme files)
npx vitest run      # unit tests for pure helpers (Windows: from PowerShell with an uppercase C:\ path)
npx vite build      # production build
```

The dev server runs in Docker (`docker compose up -d` at the repository root → http://localhost:5173).

## Structure

| Folder | What |
|---|---|
| `src/routes/` | Pages (Calendar, Chores, ShoppingList, Recipes, Packing, Board, Settings, …) |
| `src/features/<feature>/` | `<feature>Api.ts` (types, query keys, hooks), components, pure helpers with `*.test.ts` next to them |
| `src/components/ui/` | Themed building blocks (Base UI / shadcn style): button, dialog, popover, date and time pickers, … |
| `src/layout/` | Header, navigation (incl. badges), page frame |
| `src/features/realtime/` | Socket connection and topic → query-key mapping (`invalidation.ts`) |
| `src/index.css` | Tailwind v4 setup and the colour tokens of all themes (`components/themes.ts` lists them) |

## Conventions

- Server state only in TanStack Query (one key per resource, `['household', hid, …]`); mutations write the server's answer into the cache, optimistic where it helps (votes, reactions, ticking shopping items).
- Pure logic in `.ts` files with tests; `.tsx` files export components only.
- Colours only through theme tokens (`bg-primary`, `text-muted-foreground`, …), checked for WCAG AA contrast in every theme.
- Every control has an accessible name; dialogs and popovers return focus; things that can be dragged also work with the keyboard.
