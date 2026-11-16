# Plan: Shopping lists, recipes and meal planner

Status: **done 2026-11-15** (phases 1–5). Decisions and results: [../HANDOFF.md](../HANDOFF.md). Conventions: [../HANDOFF.md](../HANDOFF.md).

## Context

`/shopping-list` is a placeholder (`frontend/src/routes/ShoppingList.tsx`, 24 lines, no backend). The user wants a real household shopping feature; their requirements are the **minimum spec**:
- several shopping lists; items with **amount + unit**, a name field with **autocomplete suggestions**;
- **customizable categories** (e.g. Freezer, Fridge, Household);
- **recipes** whose ingredients go onto a list automatically; recipes **tagged, rated, searchable**;
- plus any useful features, informed by how good apps do it.

User decisions (2026-11-15): built-in grocery catalog in **German**; **recipe import from a URL** (schema.org data) **and photo upload for manual recipes**; **meal planner** included; **ratings per member** (average shown).

Patterns taken from established apps (AnyList, Bring!, Paprika, Mealie): items sorted by store category, checked items drop into a "basket" section; suggestions from your own history first, then a catalog with a default category; recipe → list with servings scaling and untick "already have"; schema.org Recipe import from URLs; structured items (food + unit) vs. free-text notes; meal plan → week's ingredients in one step; duplicates merged when units are compatible.

Follow HANDOFF conventions: everything under `/api/households/:hid/…` behind `requireMembership` (404 for strangers); routes → service → views; Zod; `AppError`s; live topics (events carry topics only); people = membership ids; TanStack Query keys `['household', hid, …]`; shadcn/Base UI components; no commits (user commits).

## Data model (MongoDB, own collections, all with `householdId` + timestamps)

- **`ShoppingList`** `{ name, icon?, position, createdBy }`.
- **`ShoppingItem`** `{ listId, name, nameKey (normalized), quantity: number|null, unit: UnitId|null, note, categoryId|null, checked, checkedAt, checkedBy, addedBy, fromRecipeIds[] }` (own collection: lists grow without bound). Index `{ listId, checked }`.
- **`ShoppingCategory`** `{ name, icon, position }`; household defaults seeded lazily on first use: Fruit & vegetables, Bakery, Fridge, Meat & fish, Freezer, Pantry, Drinks, Household, Drugstore, Other (English names to match the UI; renameable). Deleting one moves its items/memory to "uncategorized".
- **`ItemMemory`** (learned suggestions) `{ nameKey, name, categoryId, unit, quantity, uses, lastUsedAt }`, unique `{ householdId, nameKey }`; updated whenever an item is added/edited, so a name's category/unit are remembered.
- **Catalog** (static data table, `backend/src/domain/groceryCatalog.de.ts`): ~250 German grocery names with default category key and unit (e.g. `Milch → fridge, l`).
- **Units** (data table `domain/units.ts`): pcs, g, kg, ml, l, tsp, tbsp, pinch, pack, can, bottle, bunch, clove, slice, cup — with dimension (mass/volume/count/other) and parser aliases incl. German (EL, TL, Stk, Pck, Prise, Bund, Dose, Zehe, Scheibe, Becher).
- **`Recipe`** `{ title, description, servings, prepMinutes, cookMinutes, ingredients: [{ text, quantity, unit, name, note }], steps: [string], tags: [string] (normalized lowercase), imageUrl, sourceUrl, ratings: [{ memberId, stars 1–5 }], ratingAvg (derived, for sort/filter), cooked: { count, lastAt }, createdBy }`. Text index on title, tags, ingredient names.
- **Meals:** a new calendar kind **`meal`** on `CalendarItem` with `meal: { recipeId|null, servings }` (title = recipe title or free text, e.g. "Pizza out"). Reuses the whole calendar (drag, live, filters, iCal feed, reminders). Removing a recipe keeps planned meals as free text.

## Pure domain logic (`backend/src/domain/`, Vitest, time passed in)

- `units.ts`: parse unit aliases, convert within a dimension, `normalize` (1500 g → 1.5 kg), `canMerge`.
- `shopping.ts`: `nameKey` (trim, lowercase, collapse spaces, ß/umlaut-safe), **merge** an added item into a list (same nameKey + compatible unit → add quantities; checked duplicate → uncheck with new amount; otherwise new line), **suggest** (history by uses/recency first, then catalog; prefix before infix match; max 8).
- `ingredients.ts`: parse a free ingredient line (DE/EN) → `{ quantity, unit, name, note }`: decimals with comma, fractions (½, 1/2, 1 1/2), ranges (2–3 → upper), "etwas/some/a pinch", notes in parentheses or after a comma.
- `recipes.ts`: scale ingredients to servings (sensible rounding), aggregate ingredients of several meals (merge via units), rating average.
- `recipeImport.ts`: schema.org Recipe from JSON-LD (incl. `@graph`, arrays, HowToStep/HowToSection), ISO 8601 durations → minutes, `recipeYield` → servings, keywords/recipeCategory → tags.

## API (all under `/api/households/:hid`)

- Lists: `GET|POST /shopping/lists`, `PATCH|DELETE /shopping/lists/:id` (rename/reorder; delete: creator or admin+).
- Items: `GET /shopping/lists/:id/items`, `POST …/items` (single, merged), `POST …/items/batch` (from recipes/meals; merged), `PATCH …/items/:itemId` (edit, check/uncheck), `DELETE …/items/:itemId`, `POST …/items/clear-checked`.
- `GET /shopping/suggestions?q=` (history + catalog, with category/unit defaults).
- Categories: `GET|POST /shopping/categories`, `PATCH|DELETE /shopping/categories/:id`, `PUT /shopping/categories/order`.
- Recipes: `GET /recipes?q&tags&minRating&sort=rating|recent|cooked|title`, `GET /recipes/tags`, `POST /recipes`, `GET|PUT|DELETE /recipes/:id`, `PUT|DELETE /recipes/:id/image` (multipart, any member), `PUT /recipes/:id/rating` `{stars|null}`, `POST /recipes/:id/cooked`, `POST /recipes/:id/to-list` `{ listId, servings, ingredients: indexes }`.
- Import: `POST /recipes/import` `{ url }` → draft (not saved) incl. a fetched image token; saving the draft stores the image.
- Meals: calendar endpoints with kind `meal`; `GET /meals/ingredients?from&to&tz` → aggregated, scaled ingredients of planned meals (preview); adding uses `items/batch`.
- Live topics: `'shopping'` and `'recipes'` (both `contracts.ts` copies + `features/realtime/invalidation.ts`); meals ride on `'calendar'`.
- Permissions (app choices): every member may create/edit lists, items, categories, recipes and meals; deleting a list or recipe: its creator or admin+ (like calendar entries, reuse `canDeleteCalendarItem`'s rule).

## Security: URL import

`backend/src/media/safeFetch.ts`: only http/https, ports 80/443; resolve DNS and **refuse private, loopback, link-local, CGNAT, multicast and IPv6 ULA** addresses using Node's built-in `net.BlockList`; **pin the resolved IP** for the connection (undici `Agent` with a custom `lookup`) so DNS rebinding can't switch it; ≤ 3 redirects, each re-checked; 10 s timeout; HTML ≤ 2 MB, image ≤ 8 MB; content-type checks. Rate-limited (`limiter`). Images are always re-encoded with sharp (strips metadata). HTML parsing: find `application/ld+json` scripts with a small, maintained HTML parser (candidates `node-html-parser` / `cheerio`; check maintenance + release age before installing, as for iCal). Fallback: OpenGraph title/image only, rest manual.

## Images

Generalize `backend/src/media/avatars.ts` into an image helper with a size option (avatars 512×512 keep working); recipe photos 1200×900 WebP (cover) in `uploads/recipes/` (same `avatar_uploads` volume, already served/proxied under `/uploads`). Upload via a recipe-image multer like `middleware/avatarUpload.ts` (PNG/JPEG/WebP, 8 MB). Deleting a recipe deletes its photo; household deletion removes recipes + photos, lists, items, categories, memory (extend `householdService.remove`).

## Frontend

- **Navigation:** "Shopping" (`/shopping-list`, existing nav entry) and new **"Recipes"** (`/recipes`, tabs "Recipes" | "Meal plan"; tab in the URL like Chores).
- `features/shopping/`: `shoppingApi.ts` (hooks; optimistic check/uncheck), `ListSwitcher` (chips + "New list", rename/delete menu), `AddItemBar` (amount input, unit select, name **combobox** with suggestions — WAI-ARIA combobox: arrows/Enter/Esc; picking a suggestion fills unit/amount/category; Base UI Autocomplete if the installed version has it, else a small own one), `ItemRow` (tap/Space to check, amount · unit · name · note, category chip, edit dialog), grouped by category in category order, "In the basket (n)" collapsed at the bottom + "Clear basket", `CategoriesDialog` (add, rename, icon, move up/down — keyboard reorder, no drag-only), empty/loading/error states, live via `'shopping'`.
- `features/recipes/`: `RecipeGrid` (cards: photo, title, ★ avg, tags, total time), search box + tag chips + min-rating + sort (stored in URL), `RecipeDetail` (photo, servings stepper scaling ingredients, ingredient checkboxes → **"Add to list"** with list picker and "already have" unticking, steps, **your rating** stars (radio group, keyboard), avg + count, "Cooked it" + last cooked, **cook mode**: large steps, step ticking, screen Wake Lock when supported), `RecipeForm` (title, photo upload/replace/remove, servings, times, ingredients — one line each with live parse preview, paste many lines; steps; tags with suggestions), `ImportDialog` (URL → preview → edit form → save).
- `features/meals/`: Meal plan week view (Mon–Sun, ← →), "Add meal" (recipe picker or free text, servings, day/time), **"Add week's ingredients"** dialog (aggregated, scaled, tick off, choose list). Meals show in the calendar with a "Meals" kind chip (`features/calendar/kinds.ts`, colour `--chart-2`), opening the recipe from the occurrence dialog.
- Reuse: `PageHeader`, `EmptyState`, `ConfirmDeleteDialog`, `FormAlert`, sonner toasts with Undo (delete item, clear basket), `PeopleFilter` not needed; `Person` from `features/stats/parts.tsx` for "added by".

## Phases (each verifiable on its own)

1. **Lists & items:** models, units/shopping domain + tests, catalog, suggestions, categories (seed + customize), lists/items API + int tests (incl. 404 strangers, merge rules, live topic), Shopping page.
2. **Recipes:** model, ingredient parser + scaling + tests, CRUD, photos, tags, per-member ratings, search/filter/sort, cooked log, recipe → list, Recipes page + detail + form + cook mode.
3. **URL import:** safe fetch (+ tests for blocked addresses/redirects with a local server), JSON-LD extraction + tests on fixture pages, import dialog.
4. **Meal planner:** calendar kind `meal`, meal plan week view, aggregated ingredients → list, calendar chip/colour, iCal feed shows meals.
5. **Polish & docs:** HANDOFF (decisions, architecture rows, results), plan doc `docs/plans/shopping-recipes.md`.

## Verification

- Backend: unit tests for `domain/` (units, merge, suggest, ingredient parser DE/EN, scaling, aggregation, JSON-LD extraction, durations); integration tests in the container (`docker compose exec backend npm test`) for every route: membership 404, delete rights 403, validation 400, live notices after writes, cleanup on household delete, safe-fetch refusals (127.0.0.1, 10.x, ::1, redirect to private).
- Frontend: `npx tsc -b`, `npx oxlint src`, Vitest for pure client helpers (Windows: PowerShell, uppercase drive), `npx vite build`.
- Browser (playwright-core + Edge from the scratchpad, helpers in `pw/lib.mjs`, users `zz.*`, restart backend for rate limits, Mailpit for signups, clean up after): two users — add "2 l Milch" via autocomplete (category Fridge auto), live in the other browser, check → basket, clear basket with Undo, customize/reorder categories; create a recipe with photo, rate from two accounts (avg), search by tag/text/min rating, scale to 6 servings and add to a list (merging with existing Milch); import a recipe from a local fixture page served in the test; plan two meals, see them in the calendar, add week's ingredients; desktop 1280 + phone 390, light + dark, keyboard pass (combobox, stars, category reorder), axe on each new page/dialog.
