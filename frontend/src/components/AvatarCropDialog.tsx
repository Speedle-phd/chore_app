import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Loader2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
   createCroppedImage,
   DEFAULT_CROP_SETTINGS,
   drawCrop,
   loadImage,
   type CropSettings,
} from '@/lib/cropImage'

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25
const PREVIEW_SIZES = [72, 40] as const

type AvatarCropDialogProps = {
   open: boolean
   image: string | null
   /** Crop/zoom/rotation to start from, e.g. when re-adjusting a photo. */
   initial?: CropSettings
   onCancel: () => void
   onApply: (file: File, settings: CropSettings) => void
}

const AvatarCropDialog = ({
   open,
   image,
   initial,
   onCancel,
   onApply,
}: AvatarCropDialogProps) => {
   const [isApplying, setIsApplying] = useState(false)

   return (
      <Dialog
         open={open && Boolean(image)}
         onOpenChange={(next) => {
            if (!next && !isApplying) onCancel()
         }}
      >
         <DialogContent className='max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-lg'>
            <DialogHeader>
               <DialogTitle className='text-lg font-semibold'>
                  Adjust photo
               </DialogTitle>
               <DialogDescription>
                  Drag to reposition, scroll or pinch to zoom. When the photo
                  is focused, arrow keys move it.
               </DialogDescription>
            </DialogHeader>
            {/* Mounted per opening, so state starts fresh from `initial`. */}
            {image && (
               <CropEditor
                  image={image}
                  initial={initial ?? DEFAULT_CROP_SETTINGS}
                  isApplying={isApplying}
                  setIsApplying={setIsApplying}
                  onCancel={onCancel}
                  onApply={onApply}
               />
            )}
         </DialogContent>
      </Dialog>
   )
}

type CropEditorProps = {
   image: string
   initial: CropSettings
   isApplying: boolean
   setIsApplying: (value: boolean) => void
   onCancel: () => void
   onApply: (file: File, settings: CropSettings) => void
}

function CropEditor({
   image,
   initial,
   isApplying,
   setIsApplying,
   onCancel,
   onApply,
}: CropEditorProps) {
   const [crop, setCrop] = useState(initial.crop)
   const [zoom, setZoom] = useState(initial.zoom)
   const [rotation, setRotation] = useState(initial.rotation)
   const [croppedArea, setCroppedArea] = useState<Area | null>(null)
   const [source, setSource] = useState<HTMLImageElement | null>(null)
   const [mediaReady, setMediaReady] = useState(false)
   const [error, setError] = useState<string | null>(null)

   const previewRefs = useRef<(HTMLCanvasElement | null)[]>([])
   const latestArea = useRef<Area | null>(null)
   const frame = useRef(0)

   useEffect(() => {
      let cancelled = false
      loadImage(image)
         .then((loaded) => !cancelled && setSource(loaded))
         .catch((err: Error) => !cancelled && setError(err.message))
      return () => {
         cancelled = true
      }
   }, [image])

   const drawPreviews = useCallback(() => {
      const area = latestArea.current
      if (!source || !area) return
      const ratio = window.devicePixelRatio || 1
      previewRefs.current.forEach((canvas, index) => {
         const context = canvas?.getContext('2d')
         if (!canvas || !context) return
         const size = Math.round(PREVIEW_SIZES[index] * ratio)
         if (canvas.width !== size) {
            canvas.width = size
            canvas.height = size
         }
         drawCrop(context, source, area, rotation, size)
      })
   }, [source, rotation])

   const schedulePreview = useCallback(
      (area: Area) => {
         latestArea.current = area
         cancelAnimationFrame(frame.current)
         frame.current = requestAnimationFrame(drawPreviews)
      },
      [drawPreviews],
   )

   // Redraw once the full image has decoded (the crop area may already be known).
   useEffect(() => {
      drawPreviews()
      return () => cancelAnimationFrame(frame.current)
   }, [drawPreviews])

   const clampZoom = (value: number) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

   function reset() {
      setCrop(DEFAULT_CROP_SETTINGS.crop)
      setZoom(DEFAULT_CROP_SETTINGS.zoom)
      setRotation(DEFAULT_CROP_SETTINGS.rotation)
   }

   async function handleApply() {
      if (!source || !croppedArea) return
      setIsApplying(true)
      setError(null)
      try {
         const file = await createCroppedImage(source, croppedArea, rotation)
         onApply(file, { crop, zoom, rotation })
      } catch (err) {
         setError(err instanceof Error ? err.message : 'Could not crop this image.')
      } finally {
         setIsApplying(false)
      }
   }

   const isDefault =
      crop.x === 0 && crop.y === 0 && zoom === 1 && rotation === 0

   return (
      <>
         <div className='relative mx-auto aspect-square w-full max-w-[min(100%,55dvh)] overflow-hidden rounded-xl bg-neutral-950'>
            <Cropper
               image={image}
               crop={crop}
               zoom={zoom}
               rotation={rotation}
               minZoom={MIN_ZOOM}
               maxZoom={MAX_ZOOM}
               zoomSpeed={0.25}
               keyboardStep={10}
               aspect={1}
               cropShape='round'
               showGrid={false}
               onCropChange={setCrop}
               onZoomChange={setZoom}
               onRotationChange={setRotation}
               onCropAreaChange={(_, pixels) => schedulePreview(pixels)}
               onCropComplete={(_, pixels) => {
                  setCroppedArea(pixels)
                  schedulePreview(pixels)
               }}
               onMediaLoaded={() => setMediaReady(true)}
               style={{
                  cropAreaStyle: {
                     border: '2px solid rgb(255 255 255 / 0.9)',
                     boxShadow: '0 0 0 9999em rgb(0 0 0 / 0.6)',
                  },
               }}
            />
            {!mediaReady && !error && (
               <div className='absolute inset-0 grid place-items-center text-white/80'>
                  <Loader2 className='size-6 animate-spin' />
                  <span className='sr-only'>Loading photo…</span>
               </div>
            )}
         </div>

         <div className='grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center'>
            <div className='space-y-3'>
               <div className='flex items-center gap-2'>
                  <Button
                     type='button'
                     variant='ghost'
                     size='icon-sm'
                     aria-label='Zoom out'
                     disabled={zoom <= MIN_ZOOM}
                     onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
                  >
                     <ZoomOut />
                  </Button>
                  <Slider
                     min={MIN_ZOOM}
                     max={MAX_ZOOM}
                     step={0.01}
                     value={[zoom]}
                     onValueChange={(value) =>
                        setZoom(Array.isArray(value) ? (value[0] ?? 1) : value)
                     }
                     aria-label='Zoom'
                     className='flex-1'
                  />
                  <Button
                     type='button'
                     variant='ghost'
                     size='icon-sm'
                     aria-label='Zoom in'
                     disabled={zoom >= MAX_ZOOM}
                     onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
                  >
                     <ZoomIn />
                  </Button>
                  <span className='w-11 text-right text-xs text-muted-foreground tabular-nums'>
                     {Math.round(zoom * 100)}%
                  </span>
               </div>

               <div className='flex flex-wrap gap-2'>
                  <Button
                     type='button'
                     variant='outline'
                     onClick={() => setRotation((r) => (r + 270) % 360)}
                  >
                     <RotateCcw />
                     Rotate left
                  </Button>
                  <Button
                     type='button'
                     variant='outline'
                     onClick={() => setRotation((r) => (r + 90) % 360)}
                  >
                     <RotateCw />
                     Rotate right
                  </Button>
                  <Button
                     type='button'
                     variant='ghost'
                     disabled={isDefault}
                     onClick={reset}
                  >
                     Reset
                  </Button>
               </div>
            </div>

            <figure className='flex items-center gap-3 rounded-xl border bg-muted/40 p-3 sm:flex-col sm:gap-2'>
               <div className='flex items-end gap-3'>
                  {PREVIEW_SIZES.map((size, index) => (
                     <canvas
                        key={size}
                        ref={(node) => {
                           previewRefs.current[index] = node
                        }}
                        aria-hidden
                        style={{ width: size, height: size }}
                        className='rounded-full bg-muted ring-1 ring-border'
                     />
                  ))}
               </div>
               <figcaption className='text-xs text-muted-foreground'>
                  Preview
               </figcaption>
            </figure>
         </div>

         {error && (
            <p role='alert' className='text-sm text-destructive'>
               {error}
            </p>
         )}

         <DialogFooter className='-mx-5 -mb-5'>
            <Button
               type='button'
               variant='outline'
               onClick={onCancel}
               disabled={isApplying}
            >
               Cancel
            </Button>
            <Button
               type='button'
               onClick={handleApply}
               disabled={!source || !croppedArea || isApplying}
            >
               {isApplying && <Loader2 className='animate-spin' />}
               {isApplying ? 'Saving…' : 'Use photo'}
            </Button>
         </DialogFooter>
      </>
   )
}

export default AvatarCropDialog
