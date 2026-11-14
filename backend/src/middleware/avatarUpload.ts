import multer from 'multer'
import { BadRequestError } from '../errors'

const upload = multer({
   storage: multer.memoryStorage(),
   limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
   },
   fileFilter: (_req, file, callback) => {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']

      if (!allowedTypes.includes(file.mimetype)) {
         callback(new BadRequestError('Only PNG, JPEG and WebP images are allowed'))
         return
      }

      callback(null, true)
   },
})

export default upload
