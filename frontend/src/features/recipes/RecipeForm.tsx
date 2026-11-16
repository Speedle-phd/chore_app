import { useEffect, useId, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import * as z from 'zod'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import FormAlert from '@/features/auth/FormAlert'
import { useDebounce } from '@/hooks/useDebounce'
import { formatAmount } from '@/features/shopping/units'
import { splitLines, splitSteps } from './formText'
import { TagPicker } from './TagPicker'
import { useParsedLines, useRecipeTags, type RecipeInput } from './recipesApi'

const minutes = z
   .string()
   .trim()
   .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= 2880), 'Minutes as a whole number (up to 2880).')
const schema = z.object({
   title: z.string().trim().min(1, 'Enter a title.').max(120),
   description: z.string().trim().max(2000),
   servings: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100, 'Servings from 1 to 100.'),
   prepMinutes: minutes,
   cookMinutes: minutes,
   ingredients: z.string().max(20_000),
   steps: z.string().max(100_000),
   tags: z.array(z.string().max(30)).max(20, 'At most 20 tags.'),
   sourceUrl: z.string().trim().refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'A web address starting with http:// or https://'),
})
type Values = z.infer<typeof schema>

/** What the form starts from (an existing recipe, an imported draft, or nothing). */
export type RecipeDraft = Partial<Omit<RecipeInput, 'ingredients'>> & { ingredients?: string[]; imageUrl?: string | null }
/** Photo change: a new file, one from the imported page, remove the current one, or leave it. */
export type PhotoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'file'; file: File } | { kind: 'remote'; url: string }

type RecipeFormProps = {
   householdId: string
   initial: RecipeDraft
   photo: PhotoChange
   onPhoto: (photo: PhotoChange) => void
   submitLabel: string
   pending: boolean
   error: unknown
   onSubmit: (input: RecipeInput) => void
}

export function RecipeForm({ householdId, initial, photo, onPhoto, submitLabel, pending, error, onSubmit }: RecipeFormProps) {
   const id = useId()
   const tags = useRecipeTags(householdId)
   const form = useForm<Values>({
      resolver: zodResolver(schema),
      defaultValues: {
         title: initial.title ?? '',
         description: initial.description ?? '',
         servings: String(initial.servings ?? 4),
         prepMinutes: initial.prepMinutes == null ? '' : String(initial.prepMinutes),
         cookMinutes: initial.cookMinutes == null ? '' : String(initial.cookMinutes),
         ingredients: (initial.ingredients ?? []).join('\n'),
         steps: (initial.steps ?? []).join('\n\n'),
         tags: initial.tags ?? [],
         sourceUrl: initial.sourceUrl ?? '',
      },
   })
   const ingredientText = useWatch({ control: form.control, name: 'ingredients' })
   const lines = useDebounce(useMemo(() => splitLines(ingredientText), [ingredientText]), 400)
   const parsed = useParsedLines(householdId, lines)

   const text = (name: keyof Values, label: string, opts: { hint?: string; multiline?: number; type?: string; inputMode?: 'numeric' | 'url'; placeholder?: string } = {}) => (
      <Controller
         name={name}
         control={form.control}
         render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className='gap-1.5'>
               <FieldLabel htmlFor={`${id}-${name}`}>{label}</FieldLabel>
               {opts.multiline ? (
                  <Textarea {...field} id={`${id}-${name}`} rows={opts.multiline} aria-invalid={fieldState.invalid} placeholder={opts.placeholder} />
               ) : (
                  <Input {...field} id={`${id}-${name}`} inputMode={opts.inputMode} aria-invalid={fieldState.invalid} placeholder={opts.placeholder} className='h-10' />
               )}
               {opts.hint && <FieldDescription>{opts.hint}</FieldDescription>}
               {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
         )}
      />
   )

   return (
      <form
         noValidate
         className='space-y-6'
         onSubmit={form.handleSubmit((v) =>
            onSubmit({
               title: v.title,
               description: v.description,
               servings: Number(v.servings),
               prepMinutes: v.prepMinutes ? Number(v.prepMinutes) : null,
               cookMinutes: v.cookMinutes ? Number(v.cookMinutes) : null,
               ingredients: splitLines(v.ingredients),
               steps: splitSteps(v.steps),
               tags: v.tags,
               sourceUrl: v.sourceUrl || null,
            }),
         )}
      >
         {Boolean(error) && <FormAlert tone='error' error={apiError(error)} />}
         <div className='grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]'>
            <div className='space-y-4'>
               {text('title', 'Title', { placeholder: 'e.g. Grandma’s lasagne' })}
               {text('description', 'Description', { multiline: 3 })}
               <div className='grid grid-cols-3 gap-3'>
                  {text('servings', 'Servings', { inputMode: 'numeric' })}
                  {text('prepMinutes', 'Prep (min)', { inputMode: 'numeric' })}
                  {text('cookMinutes', 'Cook (min)', { inputMode: 'numeric' })}
               </div>
            </div>
            <PhotoField existingUrl={initial.imageUrl ?? null} value={photo} onChange={onPhoto} />
         </div>

         <div className='grid gap-6 lg:grid-cols-2'>
            <div className='space-y-2'>
               {text('ingredients', 'Ingredients', {
                  multiline: 10,
                  hint: 'One per line, like “200 g Mehl” or “2 EL Olivenöl”. Amounts scale with the servings.',
                  placeholder: '500 g Hackfleisch\n1 Dose gehackte Tomaten\n2 EL Olivenöl',
               })}
               {lines.length > 0 && (
                  <div className='rounded-xl border bg-muted/30 p-3' aria-live='polite'>
                     <p className='mb-1.5 text-xs font-medium'>Read as</p>
                     <ul className='space-y-0.5 text-sm'>
                        {(parsed.data ?? []).map((i, n) => (
                           <li key={`${i.text}-${n}`} className='flex flex-wrap gap-x-2'>
                              <span className='w-20 shrink-0 font-semibold tabular-nums'>{formatAmount(i.quantity, i.unit) || '–'}</span>
                              <span>{i.name}</span>
                              {i.note && <span className='text-muted-foreground'>· {i.note}</span>}
                           </li>
                        ))}
                     </ul>
                  </div>
               )}
            </div>
            {text('steps', 'Steps', { multiline: 12, hint: 'One step per paragraph (leave an empty line between steps).' })}
         </div>

         <div className='max-w-xl'>{text('sourceUrl', 'Original recipe (link)', { inputMode: 'url', placeholder: 'https://…' })}</div>

         <section aria-labelledby={`${id}-tags`} className='space-y-3 rounded-xl border p-4'>
            <h2 id={`${id}-tags`} className='text-sm font-medium'>
               Tags
            </h2>
            <Controller
               name='tags'
               control={form.control}
               render={({ field }) => <TagPicker groups={tags.data?.groups ?? []} value={field.value} onChange={field.onChange} />}
            />
         </section>

         <div className='flex justify-end border-t pt-4'>
            <Button type='submit' size='lg' className='px-5' disabled={pending}>
               {pending ? 'Saving…' : submitLabel}
            </Button>
         </div>
      </form>
   )
}

/** Photo picker with preview; the file is uploaded after the recipe is saved. */
function PhotoField({ existingUrl, value, onChange }: { existingUrl: string | null; value: PhotoChange; onChange: (p: PhotoChange) => void }) {
   const id = useId()
   const preview = useMemo(() => (value.kind === 'file' ? URL.createObjectURL(value.file) : null), [value])
   useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview])
   const shown = value.kind === 'file' ? preview : value.kind === 'keep' ? existingUrl : null
   return (
      <div className='space-y-2'>
         <span id={`${id}-label`} className='text-sm font-medium'>
            Photo
         </span>
         <div className='aspect-4/3 overflow-hidden rounded-xl border bg-muted'>
            {shown ? (
               <img src={shown} alt='Recipe photo preview' className='size-full object-cover' />
            ) : value.kind === 'remote' ? (
               // Not loaded from the other site here (privacy, and the app's content policy): the server fetches it on save.
               <span className='grid size-full place-items-center p-4 text-center text-sm'>
                  <span>
                     The photo from the website is added when you save.{' '}
                     <a href={value.url} target='_blank' rel='noopener noreferrer' className='font-medium text-primary underline-offset-4 hover:underline'>
                        View it<span className='sr-only'> (opens in a new tab)</span>
                     </a>
                  </span>
               </span>
            ) : (
               <span className='grid size-full place-items-center text-sm text-muted-foreground'>No photo</span>
            )}
         </div>
         <div className='flex flex-wrap gap-2'>
            <label className='inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50'>
               <ImagePlus className='size-4' aria-hidden />
               {shown ? 'Replace photo' : 'Add photo'}
               <input
                  type='file'
                  accept='image/png,image/jpeg,image/webp'
                  className='sr-only'
                  aria-describedby={`${id}-hint`}
                  onChange={(e) => {
                     const file = e.target.files?.[0]
                     if (file) onChange({ kind: 'file', file })
                     e.target.value = ''
                  }}
               />
            </label>
            {(shown || value.kind === 'remote') && (
               <Button type='button' variant='ghost' size='sm' onClick={() => onChange(existingUrl && value.kind === 'file' ? { kind: 'keep' } : { kind: 'remove' })}>
                  <Trash2 className='text-destructive' />
                  Remove
               </Button>
            )}
         </div>
         <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
            PNG, JPEG or WebP, up to 8 MB.
         </p>
      </div>
   )
}
