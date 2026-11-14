import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { AppError, TooManyRequestsError } from '../errors/errors'

export const errorHandler: ErrorRequestHandler = (err: unknown, _req : Request, res : Response, _next: NextFunction) => {
   if (res.headersSent) {
      return
   }

   if (err instanceof AppError) {
      if (err instanceof TooManyRequestsError) {
         res.set('Retry-After', String(err.retryAfterSeconds))
      }
      res.status(err.statusCode ?? 500).json({
         message: err.message,
         ...(err.code ? { code: err.code } : {}),
         ...(err.details ? { details: err.details } : {}),
      })
      return
   }

   if (err instanceof ZodError) {
      res.status(400).json({
         message: 'Invalid input',
         code: 'VALIDATION_ERROR',
         details: err.issues.map((issue) =>
            issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
         ),
      })
      return
   }

   if (err instanceof multer.MulterError) {
      res.status(400).json({
         message: err.code === 'LIMIT_FILE_SIZE' ? 'The image must be 5 MB or smaller.' : err.message,
         code: err.code,
      })
      return
   }

   // Errors from body parsing etc. that carry a safe 4xx status (http-errors).
   if (isClientHttpError(err)) {
      res.status(err.status).json({ message: err.message })
      return
   }

   if (isDuplicateKeyError(err)) {
      const field = Object.keys(err.keyValue ?? {})[0] ?? 'value'
      res.status(409).json({
         message: `That ${field} is already taken`,
      })
      return
   }

   console.error(err)

   res.status(500).json({
      message: 'Internal Server Error',
   })
}


function isClientHttpError(
   err: unknown,
): err is { status: number; message: string; expose: true } {
   const e = err as { status?: unknown; expose?: unknown }
   return (
      typeof e === 'object' &&
      e !== null &&
      e.expose === true &&
      typeof e.status === 'number' &&
      e.status >= 400 &&
      e.status < 500
   )
}

type DuplicateKeyError = { code: 11000; keyValue?: Record<string, unknown> }

function isDuplicateKeyError(err: unknown): err is DuplicateKeyError {
   return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: unknown }).code === 11000
   )
}
