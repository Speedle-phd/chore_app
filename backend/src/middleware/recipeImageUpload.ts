import type { RequestHandler } from 'express'
import multer from 'multer'
import { BadRequestError } from '../errors'

/** Largest recipe photo accepted (phone photos); it's re-encoded smaller anyway. App choice. */
export const MAX_RECIPE_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp']

const upload = multer({
   storage: multer.memoryStorage(),
   limits: { fileSize: MAX_RECIPE_IMAGE_BYTES, files: 1 },
   fileFilter: (_req, file, callback) => {
      if (ALLOWED.includes(file.mimetype)) callback(null, true)
      else callback(new BadRequestError('Only PNG, JPEG and WebP images are allowed.'))
   },
}).single('image')

/** One photo in the `image` field, as `req.file`; required. */
export const recipeImageUpload: RequestHandler = (req, res, next) => {
   upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new BadRequestError('The photo must be 8 MB or smaller.'))
      if (err) return next(err)
      if (!req.file) return next(new BadRequestError('Choose a photo.'))
      next()
   })
}
