import { Schema, model, Types } from 'mongoose'

export const AUDIT_EVENTS = [
   'signup',
   'email_verified',
   'login_success',
   'login_failure',
   'login_locked',
   'logout',
   'password_reset_requested',
   'password_reset',
   'password_changed',
   'session_revoked',
   'passkey_added',
   'passkey_removed',
   'account_deleted',
] as const
export type AuditEvent = (typeof AUDIT_EVENTS)[number]

/** Append-only security log. Never store passwords, tokens or session ids. */
const auditLogSchema = new Schema({
   event: { type: String, enum: AUDIT_EVENTS, required: true },
   userId: { type: Types.ObjectId, ref: 'User', default: null, index: true },
   ip: { type: String, default: null },
   userAgent: { type: String, default: null },
   at: { type: Date, required: true },
})

export const AuditLog = model('AuditLog', auditLogSchema)
