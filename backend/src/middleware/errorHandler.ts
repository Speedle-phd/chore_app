import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express'
import { AppError } from '../errors/errors'

export const errorHandler: ErrorRequestHandler = (err : AppError, _req : Request, res : Response, _next: NextFunction) => {
   if (res.headersSent) {
      return
   }

   if (err instanceof AppError) {
      res.status(err.statusCode ?? 500).json({
         message: err.message,
      })
      return
   }

   console.error(err)

   res.status(500).json({
      message: 'Internal Server Error',
   })
}
