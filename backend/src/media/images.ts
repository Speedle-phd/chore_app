import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

/** Where a kind of image lives: its public URL prefix and the size it is stored at (cover crop). */
export type ImageKind = { urlPrefix: string; width: number; height: number }

export const AVATAR_IMAGES: ImageKind = { urlPrefix: '/uploads/avatars/', width: 512, height: 512 }
/** 4:3, wide enough for a full-width recipe photo on desktop. App choice. */
export const RECIPE_IMAGES: ImageKind = { urlPrefix: '/uploads/recipes/', width: 1200, height: 900 }

/** Decodes, re-encodes and stores an image as WebP; returns its public URL. */
export async function saveImage(buffer: Buffer, directory: string, kind: ImageKind): Promise<string> {
   await mkdir(directory, { recursive: true })
   const filename = `${randomUUID()}.webp`
   // Re-encoding strips metadata and anything that isn't image data.
   await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(kind.width, kind.height, { fit: 'cover', position: 'centre' })
      .webp({ quality: 85 })
      .toFile(path.join(directory, filename))
   return `${kind.urlPrefix}${filename}`
}

/** Deletes a stored image by its public URL. Missing files and foreign URLs are ignored. */
export async function deleteImage(url: string | null | undefined, directory: string, kind: ImageKind) {
   if (!url?.startsWith(kind.urlPrefix)) return
   // basename() keeps a crafted URL from escaping the directory.
   await unlink(path.join(directory, path.basename(url))).catch(() => undefined)
}
