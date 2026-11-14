import { useEffect, useId, useRef, useState } from 'react'
import { Crop, ImagePlus, Upload, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { CropSettings } from '@/lib/cropImage'
import { cn } from '@/lib/utils'
import AvatarCropDialog from './AvatarCropDialog'

// Originals are cropped and downscaled in the browser before upload, so large
// phone photos are fine; the cropped result is small.
const MAX_SOURCE_IMAGE_SIZE = 25 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

type AvatarFieldProps = {
   label?: string
   /** The newly picked (cropped) picture, if any. */
   value: File | undefined
   /** The picture already saved, shown until a new one is picked. */
   existingUrl?: string | null | undefined
   onChange: (file: File | undefined) => void
}

/** Upload, drag & drop, crop and re-adjust a round profile picture. */
const AvatarField = ({ label = 'Profile picture', value, existingUrl, onChange }: AvatarFieldProps) => {
   const inputId = useId()
   const inputRef = useRef<HTMLInputElement>(null)
   const [inputKey, setInputKey] = useState(0)
   const [error, setError] = useState<string | null>(null)
   const [isDragging, setIsDragging] = useState(false)
   // The original photo is kept so the crop can be adjusted again later.
   const [cropSource, setCropSource] = useState<{ url: string; settings?: CropSettings } | null>(null)
   const [cropOpen, setCropOpen] = useState(false)
   const [preview, setPreview] = useState<string>()

   const cropSourceUrl = cropSource?.url
   useEffect(() => {
      if (!cropSourceUrl) return
      return () => URL.revokeObjectURL(cropSourceUrl)
   }, [cropSourceUrl])

   useEffect(() => {
      if (!value) {
         setPreview(undefined)
         return
      }
      const url = URL.createObjectURL(value)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
   }, [value])

   const shown = preview ?? existingUrl ?? undefined

   function pick(file?: File) {
      setError(null)
      if (!file) return
      if (!ACCEPTED_TYPES.includes(file.type)) return setError('Choose a PNG, JPG or WebP image.')
      if (file.size > MAX_SOURCE_IMAGE_SIZE) return setError('The image must be 25 MB or smaller.')
      setCropSource({ url: URL.createObjectURL(file) })
      setCropOpen(true)
   }

   return (
      <div className='space-y-2'>
         <label htmlFor={inputId} className='text-sm font-medium'>
            {label}
         </label>
         <div
            className={cn(
               'flex items-center gap-4 rounded-lg border bg-card p-3 transition-colors',
               isDragging && 'border-dashed border-primary bg-primary/5',
            )}
            onDragOver={(event) => {
               event.preventDefault()
               setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
               event.preventDefault()
               setIsDragging(false)
               pick(event.dataTransfer.files?.[0])
            }}
         >
            <Avatar className='size-14 shrink-0'>
               <AvatarImage src={shown} alt='Picture preview' />
               <AvatarFallback className='bg-secondary text-primary'>
                  <ImagePlus className='size-5' />
               </AvatarFallback>
            </Avatar>

            <div className='min-w-0 flex-1 space-y-1.5'>
               <div className='flex flex-wrap gap-2'>
                  <Button type='button' variant='outline' onClick={() => inputRef.current?.click()}>
                     <Upload />
                     {shown ? 'Change' : 'Upload'}
                  </Button>
                  {value && cropSource?.settings && (
                     <Button type='button' variant='outline' onClick={() => setCropOpen(true)}>
                        <Crop />
                        Adjust
                     </Button>
                  )}
               </div>
               <p className='text-xs text-muted-foreground'>
                  {isDragging ? 'Drop to use this photo' : 'Or drop a photo here · PNG, JPG or WebP · up to 25 MB'}
               </p>
            </div>

            {value && (
               <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-8 shrink-0 text-muted-foreground hover:text-destructive'
                  aria-label={existingUrl ? 'Discard new picture' : 'Remove picture'}
                  onClick={() => {
                     onChange(undefined)
                     setCropSource(null)
                     setError(null)
                     setInputKey((k) => k + 1)
                  }}
               >
                  <X className='size-4' />
               </Button>
            )}
         </div>

         <input
            key={inputKey}
            ref={inputRef}
            id={inputId}
            type='file'
            accept={ACCEPTED_TYPES.join(',')}
            className='hidden'
            aria-invalid={Boolean(error)}
            onChange={(event) => pick(event.target.files?.[0])}
         />
         {error && (
            <p role='alert' className='text-sm text-destructive'>
               {error}
            </p>
         )}

         <AvatarCropDialog
            open={cropOpen}
            image={cropSource?.url ?? null}
            initial={cropSource?.settings}
            onCancel={() => {
               setCropOpen(false)
               // Nothing was applied from a freshly picked photo: forget it.
               setCropSource((source) => (source?.settings ? source : null))
               setInputKey((k) => k + 1)
            }}
            onApply={(file, settings) => {
               onChange(file)
               setCropSource((source) => (source ? { ...source, settings } : null))
               setCropOpen(false)
               setInputKey((k) => k + 1)
            }}
         />
      </div>
   )
}

export default AvatarField
