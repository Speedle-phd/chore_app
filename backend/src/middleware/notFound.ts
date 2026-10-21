import { Request, Response, NextFunction } from 'express'
import { NotFoundError } from '../errors/errors'

export const notFound = (
   _req: Request,
   _res: Response,
   next: NextFunction,
): void => {
   next(new NotFoundError('Route not found'))
}
