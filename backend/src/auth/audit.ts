import type { Request } from 'express'
import type { Types } from 'mongoose'
import { AuditLog, type AuditEvent } from '../models/auditLogModel'

export async function audit(
   req: Request,
   event: AuditEvent,
   userId: Types.ObjectId | string | null = null,
) {
   await AuditLog.create({
      event,
      userId,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      at: new Date(),
   })
}
