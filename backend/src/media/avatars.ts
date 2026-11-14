import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export const AVATAR_URL_PREFIX = '/uploads/avatars/'

/** Decodes, re-encodes and stores an uploaded image as a 512×512 WebP; returns its public URL. */
export async function saveAvatar(buffer: Buffer, directory: string): Promise<string> {
   await mkdir(directory, { recursive: true })
   const filename = `${randomUUID()}.webp`
   // Re-encoding strips metadata and anything that isn't image data.
   await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(512, 512, { fit: 'cover', position: 'centre' })
      .webp({ quality: 85 })
      .toFile(path.join(directory, filename))
   return `${AVATAR_URL_PREFIX}${filename}`
}

/** Deletes a stored avatar by its public URL. Missing files are ignored. */
export async function deleteAvatar(url: string | null | undefined, directory: string) {
   if (!url?.startsWith(AVATAR_URL_PREFIX)) return
   // basename() keeps a crafted URL from escaping the avatar directory.
   await unlink(path.join(directory, path.basename(url))).catch(() => undefined)
}
