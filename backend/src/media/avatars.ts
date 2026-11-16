import { AVATAR_IMAGES, deleteImage, saveImage } from './images'

export const AVATAR_URL_PREFIX = AVATAR_IMAGES.urlPrefix

/** Decodes, re-encodes and stores an uploaded image as a 512×512 WebP; returns its public URL. */
export const saveAvatar = (buffer: Buffer, directory: string) => saveImage(buffer, directory, AVATAR_IMAGES)

/** Deletes a stored avatar by its public URL. Missing files are ignored. */
export const deleteAvatar = (url: string | null | undefined, directory: string) => deleteImage(url, directory, AVATAR_IMAGES)
