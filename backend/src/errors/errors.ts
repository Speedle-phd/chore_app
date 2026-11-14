import { StatusCodes } from 'http-status-codes'

export class AppError extends Error {
   constructor(
      message: string,
      public readonly statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR,
      /** Stable machine-readable code for clients, e.g. 'EMAIL_NOT_VERIFIED'. */
      public readonly code?: string,
      /** Extra safe-to-show details, e.g. a list of validation problems. */
      public readonly details?: string[],
   ) {
      super(message)
      this.name = this.constructor.name
   }
}

export class NotFoundError extends AppError {
   constructor(message = 'Not Found') {
      super(message, StatusCodes.NOT_FOUND)
   }
}
export class ValidationError extends AppError {
   constructor(message: string) {
      super(message, StatusCodes.BAD_REQUEST)
   }
}
export class UnauthorizedError extends AppError {
   constructor(message: string, code?: string) {
      super(message, StatusCodes.UNAUTHORIZED, code)
   }
}
export class ForbiddenError extends AppError {
   constructor(message: string, code?: string) {
      super(message, StatusCodes.FORBIDDEN, code)
   }
}
export class ConflictError extends AppError {
   constructor(message: string) {
      super(message, StatusCodes.CONFLICT)
   }
}
export class InternalServerError extends AppError {
   constructor(message: string) {
      super(message, StatusCodes.INTERNAL_SERVER_ERROR)
   }
}
export class BadRequestError extends AppError {
   constructor(message: string, details?: string[], code?: string) {
      super(message, StatusCodes.BAD_REQUEST, code, details)
   }
}
export class TooManyRequestsError extends AppError {
   constructor(
      message: string,
      public readonly retryAfterSeconds: number,
   ) {
      super(message, StatusCodes.TOO_MANY_REQUESTS, 'RATE_LIMITED')
   }
}
