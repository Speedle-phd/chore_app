import type { NextFunction, Request, Response } from 'express'
import { ForbiddenError } from '../errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Header every state-changing request from our own client must carry. */
export const CSRF_HEADER = 'x-requested-with'
export const CSRF_HEADER_VALUE = 'fetch'

/**
 * CSRF defence for cookie-authenticated requests (OWASP CSRF cheat sheet):
 * reject cross-site requests via Fetch Metadata and require a custom header,
 * which a cross-origin page can't send without passing a CORS preflight.
 */
export function csrfProtection(
   req: Request,
   _res: Response,
   next: NextFunction,
): void {
   if (SAFE_METHODS.has(req.method)) return next()

   const site = req.get('sec-fetch-site')
   if (site && site !== 'same-origin' && site !== 'none') {
      return next(new ForbiddenError('Cross-site request blocked'))
   }
   if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      return next(new ForbiddenError('Missing request header'))
   }
   next()
}
