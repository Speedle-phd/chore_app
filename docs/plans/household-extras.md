# Plan: Household extras (candidate features)

Status: **proposed 2026-11-16.** Chosen so far: 1, 3, 11 → [holidays-packing-pwa.md](holidays-packing-pwa.md); 7, 10, 12, 13 (2026-11-16) → [rewards-pinboard-guest.md](rewards-pinboard-guest.md). User decisions are in those plans. The rest is backlog until the user picks more.

## How to use this plan

1. The user ticks features in **Decisions** (and answers their questions).
2. The chosen ones get ordered into phases; each phase gets the usual detail (data model, domain logic, API, frontend, verification) before building, like [shopping-recipes.md](shopping-recipes.md).
3. Features left unticked stay here as backlog. A feature the user declines gets "Declined" so it isn't proposed again.

Effort: **S** about one session, **M** two to three sessions, **L** more than that. Rough guesses.

## Decisions (for the user)

| # | Feature | Effort | Build? | Open questions |
|---|---|---|---|---|
| 1 | Public + school holidays | S–M | ☑ (public only) | Q1.1–Q1.4 |
| 2 | Waste collection calendar | S | ☐ | Q2.1–Q2.2 |
| 3 | Packing lists | S–M | ☑ | Q3.1 |
| 4 | Pantry with best-before dates | M | ☐ | Q4.1–Q4.3 |
| 5 | "What can I cook?" | S (needs 4) | ☐ | — |
| 6 | Household money (Haushaltskasse) | M–L | ☐ | Q6.1–Q6.3 |
| 7 | Rewards for points | M | ☑ (approval per reward, points never expire) | Q7.1–Q7.2 |
| 8 | Meter readings | S–M | ☐ | Q8.1 |
| 9 | Contracts and deadlines | M | ☐ | Q9.1 |
| 10 | Maintenance / plant / pet templates | S | ☑ | — |
| 11 | Installable app (PWA), offline, push | M–L | ☑ | Q11.1–Q11.2 |
| 12 | Pinboard and polls | M | ☑ (named votes) | — |
| 13 | Guest / babysitter info page | S–M | ☑ (no health data) | Q13.1 |

My suggested order if all are wanted (my suggestion, not a user decision): 1 + 2 (calendar data, high value for German households) → 11 (offline shopping list) → 4 + 5 (ties shopping, recipes and meals together) → the rest by interest.

---

## 1. Public and school holidays (Feiertage, Schulferien)

**What:** holidays shown in the calendar background, by the household's German state (Bundesland).

- **Public holidays:** nationwide ones (Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, Tag der Deutschen Einheit, 1./2. Weihnachtstag) plus state ones (Heilige Drei Könige, Fronleichnam, Mariä Himmelfahrt, Reformationstag, Allerheiligen, Buß- und Bettag, Weltfrauentag, Weltkindertag). Movable ones follow from Easter Sunday (Gauss/Anonymous Gregorian algorithm). Pure function in `backend/src/domain/holidays.ts` with a cited data table per state, tests against official lists for a few years (use `domain-rules`). No external data needed.
- **School holidays:** set by each state's ministry of education every year; can't be computed. Needs a data source (see Q1.2).
- **Where it shows:** a background band and label in the calendar (not `CalendarItem`s: computed per requested range, read-only); vacation clash suggestions mention holidays; included in the iCal feed as an option; the reminder digest can mention "tomorrow is a public holiday".
- **Chores:** optional per repeating chore "skip public holidays" or "move to the next working day", built on the existing EXDATE / override mechanics in `domain/recurrence.ts`.
- **Data:** `Household.region: { country: 'DE', state: 'BY' | … | null }`, set in Settings by managers.

Questions:
- **Q1.1** Germany only, or also Austria / Switzerland (or other countries) later? Germany only keeps the table small; the data model would still allow more.
- **Q1.2** School holidays: (a) built-in table updated by hand each year, (b) fetch from a public API (e.g. ferien-api.de; terms and reliability need checking first) and cache, or (c) skip school holidays.
- **Q1.3** Per-member region (e.g. someone works in another state) or one region per household?
- **Q1.4** Chores on public holidays: offer "skip" / "move to next working day", or only display holidays?

## 2. Waste collection calendar (Abfallkalender)

**What:** bin collection days (Restmüll, Bio, Papier, Gelber Sack) in the calendar, plus a rotating "put the bins out" chore.

- Most municipalities publish an iCal link. Builds on the existing .ics import plus the open item "iCal import from a URL" (reuse `media/safeFetch.ts`, SSRF-safe).
- **Subscription, not one-off import:** store the URL, re-fetch daily in the `worker`, update by UID (import already recognises UIDs).
- Optional: create a chore "put out <bin>" the evening before, rotating between chosen members, linked to the collection entries.
- Bin types get colors / icons (mapped from the entry title keywords; editable).

Questions:
- **Q2.1** Generic "subscribe to any iCal URL" (also useful for school or sports club calendars), or specific to waste?
- **Q2.2** Auto-create the "bins out" chore, or only show the dates?

## 3. Packing lists

**What:** reusable checklist templates ("Summer holiday", "Weekend at grandma's"), one copy per trip, attachable to a vacation entry; items can be per person.

- Reuse the shopping list UI and live updates; separate collections (`PackingTemplate`, `PackingList`) so they don't mix with groceries.
- Unchecked items can go to a shopping list ("buy sunscreen").

Questions:
- **Q3.1** Own section in the nav, or only inside a vacation entry?

## 4. Pantry with best-before dates (Vorrat)

**What:** what's at home, with amounts and optional best-before dates.

- When the basket is cleared, items can move to the pantry (opt-in per list or per item). Using up an item offers "put on shopping list".
- "Expires soon" list; optional mention in the reminder digest.
- Reuses `units.ts`, `nameKey`, categories and the grocery catalog; cooking a recipe (cook mode / "cooked") can subtract its ingredients.

Questions:
- **Q4.1** Track amounts (500 g flour), or just "have / running low / out"? Amounts are more precise but tedious to maintain.
- **Q4.2** Storage places (fridge, freezer, cellar) separate from shopping categories?
- **Q4.3** Subtract ingredients automatically when a recipe is marked cooked?

## 5. "What can I cook?"

**What:** in Recipes, sort/filter by how many ingredients are in the pantry, and prefer recipes that use soon-expiring items. Missing ingredients go to the shopping list in one step. Pure ranking function in `domain/recipes.ts`. Needs 4.

## 6. Household money (Haushaltskasse)

**What:** record who paid what, split among members (equal, shares or exact amounts), balances, and "settle up" with the fewest transfers.

- Money in integer cents, one currency per household (EUR); pure split / balance / settlement logic in `domain/` with tests.
- Optional: clearing a shopping basket offers "add as expense"; recurring expenses (rent, Netflix) via the existing recurrence code.
- Statistics per category and month.

Questions:
- **Q6.1** Who can see it: everyone, or adults / managers only? Kid profiles probably shouldn't.
- **Q6.2** Receipt photos (reuse image uploads)?
- **Q6.3** Only between members, or also people outside the household?

## 7. Rewards for points

**What:** managers define rewards ("choose Friday's movie" 50 pts, "€2 pocket money" 100 pts); members redeem points, a manager approves.

- Needs a points balance: earned (existing stats) minus redeemed, so a `Redemption` collection; the leaderboard stays based on earned points.
- Fits households with kids (profiles without login can be redeemed for by a manager).

Questions:
- **Q7.1** Approval needed for every redemption, or optional per reward?
- **Q7.2** Should points expire or reset (e.g. yearly)?

## 8. Meter readings (Zählerstände)

**What:** meters (electricity, gas, water, heating) with readings, consumption per month/year as a chart, a monthly reminder to read them, an estimate to the billing date.

- Small own collection; chart reuses the stats chart components; reading reminder is a repeating chore or a reminder subscription.

Questions:
- **Q8.1** Track prices too (cost estimates, comparison with the utility bill), or only consumption?

## 9. Contracts and deadlines

**What:** contracts (insurance, internet, mobile, gym, energy) with provider, cost, term and notice period (Kündigungsfrist); warranties; one-off deadlines (car inspection / TÜV, ID card expiry, tax return).

- Pure function: last day to cancel from start date, minimum term, renewal and notice period; reminders N weeks before in the digest; shown in the calendar as deadlines.
- Optional document upload (PDF) — that would be the first non-image upload; size limits and storage need thought.

Questions:
- **Q9.1** Document uploads (contract PDFs, receipts for warranties), or only data + reminders?

## 10. Maintenance, plant and pet templates

**What:** no new model. A "Add from template" picker for repeating chores: change extractor filter (3 months), test smoke detectors (yearly), descale kettle, water plants, deworm the cat, … with sensible intervals and effort. Data table + a picker in the chore dialog. Could pair with the never-built chore checklists (HANDOFF open item 4).

## 11. Installable app (PWA), offline, push

**What:**

- **Installable:** web app manifest, icons, service worker (e.g. `vite-plugin-pwa`).
- **Offline:** shopping list readable and checkable offline in the store, changes queued and synced on reconnect (TanStack Query offline persistence + mutation queue); merge rules for conflicting changes.
- **Push notifications:** Web Push (VAPID) for due chores, reminders and "someone added to the shopping list"; per-person settings; sent by the `worker`. iOS only delivers push to installed home-screen apps.

Questions:
- **Q11.1** Offline scope: shopping list only, or also chores / calendar (read-only)?
- **Q11.2** Which events should push: due chores, reminders, shopping changes, new pinboard posts?

## 12. Pinboard and polls

**What:** short notes on a household board (pin, expire after N days), quick polls ("Pizza or pasta?", "Who's home Saturday?") with live results over Socket.IO. Optional link of a poll to a meal plan entry.

## 13. Guest / babysitter info page

**What:** a household info page (Wi-Fi, emergency contacts, doctor, the kids' routines, allergies, where things are) shared via a private, revocable read-only link like the iCal feed token, optionally with an expiry date.

- Sensitive data: link token hashed at rest, rate limited, `noindex`, clear warning what the link shows.

Questions:
- **Q13.1** Which sections, and should health data (allergies, medication) be allowed on a shareable page at all?

---

## Not proposed (left out on purpose)

- Weather in the calendar: needs an external API key, little household value.
- Anything already declined earlier (see HANDOFF / memory): changing e-mail address, mailer port 465.
