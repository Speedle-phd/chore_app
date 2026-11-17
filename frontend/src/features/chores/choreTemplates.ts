/**
 * Starting points for repeating chores ("Start from a template" in the chore dialog).
 * Picking one only fills the form; nothing is stored about the template.
 *
 * App choices (docs/plans/rewards-pinboard-guest.md, phase 1): things that should happen at a
 * steady pace after the last time use `afterDays` ("repeat after it's done"); date-bound ones use
 * a fixed repeat, and `month` makes them start in that month. Intervals and efforts are common
 * household guidance, not rules: everything can be changed before saving.
 */

export type TemplateRepeat =
   | { every: number; unit: 'day' | 'week' | 'month' | 'year' }
   | { afterDays: number }

export type ChoreTemplate = {
   id: string
   title: string
   /** 1 = a quick task … 5 = a big job (the chore's effort). */
   effort: 1 | 2 | 3 | 4 | 5
   repeat: TemplateRepeat
   /** Month (1–12) it is due in, for yearly chores tied to a season. */
   month?: number
   notes?: string
}

export type TemplateGroup = { id: string; label: string; templates: readonly ChoreTemplate[] }

export const CHORE_TEMPLATE_GROUPS: readonly TemplateGroup[] = [
   {
      id: 'basics',
      label: 'Weekly basics',
      templates: [
         { id: 'vacuum', title: 'Vacuum', effort: 2, repeat: { every: 1, unit: 'week' } },
         { id: 'bathroom', title: 'Clean the bathroom', effort: 3, repeat: { every: 1, unit: 'week' } },
         { id: 'mop', title: 'Mop the floors', effort: 3, repeat: { every: 1, unit: 'week' } },
         { id: 'bins', title: 'Take out the bins', effort: 1, repeat: { every: 1, unit: 'week' } },
         { id: 'towels', title: 'Wash the towels', effort: 2, repeat: { every: 1, unit: 'week' } },
         { id: 'sheets', title: 'Change the bed sheets', effort: 2, repeat: { every: 2, unit: 'week' } },
         { id: 'dust', title: 'Dust the shelves', effort: 2, repeat: { every: 2, unit: 'week' } },
      ],
   },
   {
      id: 'home',
      label: 'Home maintenance',
      templates: [
         {
            id: 'smoke-detectors',
            title: 'Test the smoke detectors',
            effort: 1,
            repeat: { every: 1, unit: 'year' },
            notes: 'Press the test button on each one until it beeps; change the battery if it doesn’t.',
         },
         {
            id: 'extractor-filter',
            title: 'Clean the extractor hood filter',
            effort: 2,
            repeat: { every: 3, unit: 'month' },
            notes: 'Metal filters can go in the dishwasher; carbon filters need replacing.',
         },
         {
            id: 'descale-kettle',
            title: 'Descale the kettle',
            effort: 1,
            repeat: { afterDays: 30 },
            notes: 'Citric acid or vinegar, then boil clean water twice.',
         },
         {
            id: 'descale-coffee',
            title: 'Descale the coffee machine',
            effort: 2,
            repeat: { afterDays: 60 },
            notes: 'Use the machine’s descaling programme.',
         },
         {
            id: 'washing-machine',
            title: 'Clean the washing machine',
            effort: 2,
            repeat: { every: 1, unit: 'month' },
            notes: 'Wipe the door seal, rinse the detergent drawer, run an empty hot wash.',
         },
         { id: 'dishwasher-filter', title: 'Clean the dishwasher filter', effort: 1, repeat: { every: 1, unit: 'month' } },
         {
            id: 'fridge',
            title: 'Clean out the fridge',
            effort: 2,
            repeat: { every: 1, unit: 'month' },
            notes: 'Throw out what’s old, wipe the shelves.',
         },
         { id: 'defrost-freezer', title: 'Defrost the freezer', effort: 4, repeat: { every: 1, unit: 'year' } },
         {
            id: 'bleed-radiators',
            title: 'Bleed the radiators',
            effort: 2,
            repeat: { every: 1, unit: 'year' },
            month: 10,
            notes: 'Before the heating season; check the boiler pressure afterwards.',
         },
         { id: 'windows', title: 'Clean the windows', effort: 4, repeat: { every: 3, unit: 'month' } },
         { id: 'gutters', title: 'Clean the gutters', effort: 4, repeat: { every: 1, unit: 'year' }, month: 11 },
      ],
   },
   {
      id: 'plants',
      label: 'Plants',
      templates: [
         { id: 'water-plants', title: 'Water the plants', effort: 1, repeat: { afterDays: 3 } },
         {
            id: 'fertilise',
            title: 'Fertilise the plants',
            effort: 1,
            repeat: { every: 2, unit: 'week' },
            notes: 'In the growing season, spring to autumn.',
         },
         { id: 'repot', title: 'Repot the plants', effort: 3, repeat: { every: 1, unit: 'year' }, month: 3 },
      ],
   },
   {
      id: 'pets',
      label: 'Pets',
      templates: [
         { id: 'feed-pets', title: 'Feed the pets', effort: 1, repeat: { every: 1, unit: 'day' } },
         { id: 'walk-dog', title: 'Walk the dog', effort: 2, repeat: { every: 1, unit: 'day' } },
         { id: 'litter-box', title: 'Clean the litter box', effort: 1, repeat: { every: 1, unit: 'day' } },
         { id: 'cage', title: 'Clean the cage or aquarium', effort: 3, repeat: { every: 2, unit: 'week' } },
         { id: 'flea-tick', title: 'Flea and tick treatment', effort: 1, repeat: { every: 1, unit: 'month' } },
         {
            id: 'deworm',
            title: 'Deworm the pets',
            effort: 1,
            repeat: { every: 3, unit: 'month' },
            notes: 'Ask the vet how often yours need it.',
         },
         { id: 'vet', title: 'Vet check-up and vaccinations', effort: 2, repeat: { every: 1, unit: 'year' } },
      ],
   },
   {
      id: 'vehicles',
      label: 'Car & bike',
      templates: [
         { id: 'tyre-pressure', title: 'Check the tyre pressure', effort: 1, repeat: { every: 1, unit: 'month' } },
         {
            id: 'winter-tyres',
            title: 'Put on the winter tyres',
            effort: 3,
            repeat: { every: 1, unit: 'year' },
            month: 10,
            notes: 'Rule of thumb: winter tyres from October to Easter.',
         },
         { id: 'summer-tyres', title: 'Put on the summer tyres', effort: 3, repeat: { every: 1, unit: 'year' }, month: 4 },
         { id: 'bike-chain', title: 'Oil the bike chains', effort: 1, repeat: { every: 1, unit: 'month' } },
      ],
   },
]
