import type { Area, Point } from 'react-easy-crop'

export type CropSettings = { crop: Point; zoom: number; rotation: number }

export const DEFAULT_CROP_SETTINGS: CropSettings = {
   crop: { x: 0, y: 0 },
   zoom: 1,
   rotation: 0,
}

// The server stores avatars at 512×512 (sharp resize), so uploading more is wasted.
export const AVATAR_OUTPUT_SIZE = 512
const AVATAR_QUALITY = 0.9

export async function loadImage(src: string): Promise<HTMLImageElement> {
   const image = new Image()
   image.src = src
   try {
      await image.decode()
   } catch {
      throw new Error('Could not load the selected image.')
   }
   return image
}

/**
 * Draws `area` into a `size`×`size` square of `context`.
 * `area` is in pixels of the rotated image's bounding box, as react-easy-crop
 * reports it, so the image is rotated in place instead of via a full-size
 * intermediate canvas.
 */
export function drawCrop(
   context: CanvasRenderingContext2D,
   image: HTMLImageElement,
   area: Area,
   rotation: number,
   size: number,
) {
   const radians = (rotation * Math.PI) / 180
   const sin = Math.abs(Math.sin(radians))
   const cos = Math.abs(Math.cos(radians))
   const width = image.naturalWidth
   const height = image.naturalHeight
   const boxWidth = width * cos + height * sin
   const boxHeight = width * sin + height * cos

   context.save()
   context.clearRect(0, 0, size, size)
   context.imageSmoothingEnabled = true
   context.imageSmoothingQuality = 'high'
   context.scale(size / area.width, size / area.height)
   context.translate(-area.x, -area.y)
   context.translate(boxWidth / 2, boxHeight / 2)
   context.rotate(radians)
   context.drawImage(image, -width / 2, -height / 2)
   context.restore()
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
   return new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, AVATAR_QUALITY),
   )
}

export async function createCroppedImage(
   image: HTMLImageElement,
   area: Area,
   rotation: number,
): Promise<File> {
   // Downscale to the size the server keeps; never upscale small crops.
   const size = Math.max(1, Math.min(AVATAR_OUTPUT_SIZE, Math.round(area.width)))
   const canvas = document.createElement('canvas')
   canvas.width = size
   canvas.height = size

   const context = canvas.getContext('2d')
   if (!context) throw new Error('Your browser does not support image cropping.')
   drawCrop(context, image, area, rotation, size)

   // Safari can't encode WebP and silently returns PNG; use JPEG there instead.
   let blob = await canvasToBlob(canvas, 'image/webp')
   if (!blob || blob.type !== 'image/webp') {
      // JPEG has no transparency: put a white background behind the image.
      context.globalCompositeOperation = 'destination-over'
      context.fillStyle = '#fff'
      context.fillRect(0, 0, size, size)
      blob = await canvasToBlob(canvas, 'image/jpeg')
   }
   if (!blob) throw new Error('Could not create the cropped image.')

   const extension = blob.type === 'image/webp' ? 'webp' : 'jpg'
   return new File([blob], `avatar.${extension}`, { type: blob.type })
}
