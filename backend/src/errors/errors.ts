import { StatusCodes } from 'http-status-codes'

export class AppError extends Error {
   constructor(
      message: string,
      public readonly statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR,
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
   constructor(message: string) {
      super(message, StatusCodes.UNAUTHORIZED)
   }
}
export class ForbiddenError extends AppError {
   constructor(message: string) {
      super(message, StatusCodes.FORBIDDEN)
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
   constructor(message: string) {
      super(message, StatusCodes.BAD_REQUEST)
   }
}
