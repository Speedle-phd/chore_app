import type { RequestHandler } from 'express'
import multer from 'multer'
import { BadRequestError } from '../errors'

/** Largest `.ics` file accepted. App choice (a few thousand entries). */
export const MAX_ICS_BYTES = 1024 * 1024

const upload = multer({
   storage: multer.memoryStorage(),
   limits: { fileSize: MAX_ICS_BYTES, files: 1, fields: 10 },
   fileFilter: (_req, file, callback) => {
      // Browsers report .ics as text/calendar, or nothing useful on some systems.
      if (file.mimetype === 'text/calendar' || /\.ics$/i.test(file.originalname)) callback(null, true)
      else callback(new BadRequestError('Choose a calendar file (.ics).'))
   },
}).single('file')

/** One `.ics` file in the `file` field, as `req.file`; required. */
export const icsUpload: RequestHandler = (req, res, next) => {
   upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
         return next(new BadRequestError('The file must be 1 MB or smaller.'))
      }
      if (err) return next(err)
      if (!req.file) return next(new BadRequestError('Choose a calendar file (.ics).'))
      next()
   })
}
