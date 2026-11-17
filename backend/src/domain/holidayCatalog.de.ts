/**
 * German public holidays (gesetzliche Feiertage) per Bundesland.
 *
 * Sources (checked 2026-11-16):
 * - Overview and footnotes: https://de.wikipedia.org/wiki/Feiertag_(Deutschland), which cites the
 *   states' holiday laws (Feiertagsgesetze) listed in `STATES`.
 * - Tag der Deutschen Einheit: Einigungsvertrag Art. 2 Abs. 2 (federal; BGBl. II 1990 S. 890).
 * - Brandenburg Ostersonntag/Pfingstsonntag: FTG Brandenburg § 2 Abs. 1 (https://bravors.brandenburg.de/gesetze/ftg_2015).
 * - Berlin one-off holidays: Gesetz über die Sonn- und Feiertage (Berlin) as amended; 8 May 2025:
 *   https://www.berlin.de/aktuelles/9188766-958090-einmaliger-feiertag-am-8-mai-2025.html;
 *   17 June 2028: Abgeordnetenhaus Drucksache 19/1031 (https://www.parlament-berlin.de/ados/19/IIIPlen/vorgang/d19-1031.pdf).
 *
 * Decisions (see docs/plans/holidays-packing-pwa.md): Germany only, one state per household, display only.
 * App choices: holidays valid only in some municipalities are marked `partialIn`; the city-only
 * Augsburger Friedensfest is left out; Hessen's rule that every Sunday is a holiday (HFeiertagsG § 1)
 * is not listed day by day; years before 1995 aren't supported (Buß- und Bettag was nationwide until 1994).
 */

export const STATES = {
   BW: { name: 'Baden-Württemberg', law: 'Feiertagsgesetz (FTG) Baden-Württemberg' },
   BY: { name: 'Bayern', law: 'Feiertagsgesetz (FTG) Bayern' },
   BE: { name: 'Berlin', law: 'Gesetz über die Sonn- und Feiertage (Berlin)' },
   BB: { name: 'Brandenburg', law: 'Feiertagsgesetz (FTG) Brandenburg' },
   HB: { name: 'Bremen', law: 'Gesetz über die Sonn-, Gedenk- und Feiertage (Bremen)' },
   HH: { name: 'Hamburg', law: 'Feiertagsgesetz Hamburg' },
   HE: { name: 'Hessen', law: 'Hessisches Feiertagsgesetz (HFeiertagsG)' },
   MV: { name: 'Mecklenburg-Vorpommern', law: 'Feiertagsgesetz Mecklenburg-Vorpommern (FTG M-V)' },
   NI: { name: 'Niedersachsen', law: 'Niedersächsisches Gesetz über die Feiertage (NFeiertagsG)' },
   NW: { name: 'Nordrhein-Westfalen', law: 'Feiertagsgesetz NW' },
   RP: { name: 'Rheinland-Pfalz', law: 'Feiertagsgesetz (LFtG) Rheinland-Pfalz' },
   SL: { name: 'Saarland', law: 'Feiertagsgesetz (SFG) Saarland' },
   SN: { name: 'Sachsen', law: 'Gesetz über Sonn- und Feiertage im Freistaat Sachsen (SächsSFG)' },
   ST: { name: 'Sachsen-Anhalt', law: 'Gesetz über die Sonn- und Feiertage (FeiertG LSA)' },
   SH: { name: 'Schleswig-Holstein', law: 'Gesetz über Sonn- und Feiertage (SFTG) Schleswig-Holstein' },
   TH: { name: 'Thüringen', law: 'Thüringer Feier- und Gedenktagsgesetz (ThürFGtG)' },
} as const

export type StateCode = keyof typeof STATES
export const STATE_CODES = Object.keys(STATES) as StateCode[]

/** First year the catalog describes correctly. */
export const FIRST_SUPPORTED_YEAR = 1995

export type HolidayRule =
   | { type: 'fixed'; month: number; day: number }
   /** Days after Easter Sunday (negative = before). */
   | { type: 'easter'; offset: number }
   /** The Wednesday before 23 November. */
   | { type: 'bussUndBettag' }

export type HolidayRow = {
   id: string
   name: string
   rule: HolidayRule
   /** States where it is a holiday everywhere. */
   states: 'all' | readonly StateCode[]
   /** States where it is a holiday only in some municipalities. */
   partialIn?: readonly StateCode[]
   /** First / last year it applies (inclusive). */
   from?: number
   until?: number
   /** One-off: only in these years. */
   years?: readonly number[]
   source: string
}

const W = 'de.wikipedia.org/wiki/Feiertag_(Deutschland), table'

export const HOLIDAYS: readonly HolidayRow[] = [
   { id: 'neujahr', name: 'Neujahr', rule: { type: 'fixed', month: 1, day: 1 }, states: 'all', source: W },
   {
      id: 'heilige-drei-koenige',
      name: 'Heilige Drei Könige',
      rule: { type: 'fixed', month: 1, day: 6 },
      states: ['BW', 'BY', 'ST'],
      source: W,
   },
   {
      id: 'frauentag',
      name: 'Internationaler Frauentag',
      rule: { type: 'fixed', month: 3, day: 8 },
      states: ['BE'],
      from: 2019,
      source: `${W} ("seit 2019")`,
   },
   {
      id: 'frauentag',
      name: 'Internationaler Frauentag',
      rule: { type: 'fixed', month: 3, day: 8 },
      states: ['MV'],
      from: 2023,
      source: `${W} ("seit 2023")`,
   },
   { id: 'karfreitag', name: 'Karfreitag', rule: { type: 'easter', offset: -2 }, states: 'all', source: `${W}, footnote 17` },
   {
      id: 'ostersonntag',
      name: 'Ostersonntag',
      rule: { type: 'easter', offset: 0 },
      states: ['BB'],
      source: 'FTG Brandenburg § 2 Abs. 1',
   },
   { id: 'ostermontag', name: 'Ostermontag', rule: { type: 'easter', offset: 1 }, states: 'all', source: `${W}, footnote 17` },
   { id: 'tag-der-arbeit', name: 'Tag der Arbeit', rule: { type: 'fixed', month: 5, day: 1 }, states: 'all', source: W },
   {
      id: 'tag-der-befreiung',
      name: 'Tag der Befreiung',
      rule: { type: 'fixed', month: 5, day: 8 },
      states: ['BE'],
      years: [2020, 2025],
      source: `${W}, footnote 18 (75th and 80th anniversary, once each)`,
   },
   {
      id: 'christi-himmelfahrt',
      name: 'Christi Himmelfahrt',
      rule: { type: 'easter', offset: 39 },
      states: 'all',
      source: `${W}, footnote 17`,
   },
   {
      id: 'pfingstsonntag',
      name: 'Pfingstsonntag',
      rule: { type: 'easter', offset: 49 },
      states: ['BB'],
      source: 'FTG Brandenburg § 2 Abs. 1',
   },
   { id: 'pfingstmontag', name: 'Pfingstmontag', rule: { type: 'easter', offset: 50 }, states: 'all', source: `${W}, footnote 17` },
   {
      id: 'fronleichnam',
      name: 'Fronleichnam',
      rule: { type: 'easter', offset: 60 },
      states: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'],
      partialIn: ['SN', 'TH'],
      source: `${W}, footnotes 13 (SN: Fronleichnamsverordnung) and 16 (TH: § 2 Abs. 2, § 10 Abs. 1 ThürFGtG)`,
   },
   {
      id: 'volksaufstand-1953',
      name: '75. Jahrestag des Volksaufstandes vom 17. Juni 1953',
      rule: { type: 'fixed', month: 6, day: 17 },
      states: ['BE'],
      years: [2028],
      source: 'Abgeordnetenhaus Berlin, Drucksache 19/1031',
   },
   {
      id: 'mariae-himmelfahrt',
      name: 'Mariä Himmelfahrt',
      rule: { type: 'fixed', month: 8, day: 15 },
      states: ['SL'],
      partialIn: ['BY'],
      source: `${W}, footnote 20 (BY: municipalities with a predominantly Catholic population, Art. 1 Abs. 3 FTG)`,
   },
   {
      id: 'weltkindertag',
      name: 'Weltkindertag',
      rule: { type: 'fixed', month: 9, day: 20 },
      states: ['TH'],
      from: 2019,
      source: `${W} ("seit 2019")`,
   },
   {
      id: 'tag-der-deutschen-einheit',
      name: 'Tag der Deutschen Einheit',
      rule: { type: 'fixed', month: 10, day: 3 },
      states: 'all',
      source: 'Einigungsvertrag Art. 2 Abs. 2',
   },
   {
      id: 'reformationstag',
      name: 'Reformationstag',
      rule: { type: 'fixed', month: 10, day: 31 },
      states: ['BB', 'MV', 'SN', 'ST', 'TH'],
      source: W,
   },
   {
      id: 'reformationstag',
      name: 'Reformationstag',
      rule: { type: 'fixed', month: 10, day: 31 },
      states: ['HB', 'HH', 'NI', 'SH'],
      from: 2018,
      source: `${W} (new state laws of 2018; 2017 was a nationwide one-off anyway)`,
   },
   {
      id: 'reformationstag',
      name: 'Reformationstag',
      rule: { type: 'fixed', month: 10, day: 31 },
      states: 'all',
      years: [2017],
      source: `${W}, footnote 22 (500th anniversary, once)`,
   },
   {
      id: 'allerheiligen',
      name: 'Allerheiligen',
      rule: { type: 'fixed', month: 11, day: 1 },
      states: ['BW', 'BY', 'NW', 'RP', 'SL'],
      source: W,
   },
   {
      id: 'buss-und-bettag',
      name: 'Buß- und Bettag',
      rule: { type: 'bussUndBettag' },
      states: ['SN'],
      source: `${W}, footnote 23 (only Sachsen since 1995)`,
   },
   { id: 'weihnachten-1', name: '1. Weihnachtstag', rule: { type: 'fixed', month: 12, day: 25 }, states: 'all', source: W },
   { id: 'weihnachten-2', name: '2. Weihnachtstag', rule: { type: 'fixed', month: 12, day: 26 }, states: 'all', source: W },
]
