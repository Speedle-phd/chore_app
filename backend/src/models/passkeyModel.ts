import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

/** A WebAuthn credential. Only the public key is stored; the private key never leaves the device. */
const passkeySchema = new Schema(
   {
      userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
      /** Credential id (base64url), as the browser reports it. */
      credentialId: { type: String, required: true, unique: true },
      publicKey: { type: Buffer, required: true },
      /** Signature counter; a counter that goes backwards hints at a cloned authenticator. */
      counter: { type: Number, required: true, default: 0 },
      transports: { type: [String], default: [] },
      deviceType: { type: String, enum: ['singleDevice', 'multiDevice'], required: true },
      backedUp: { type: Boolean, required: true },
      name: { type: String, required: true, trim: true, maxlength: 60 },
      lastUsedAt: { type: Date, default: null },
   },
   { timestamps: true },
)

export type PasskeyType = HydratedDocument<InferSchemaType<typeof passkeySchema>>
export const Passkey = model('Passkey', passkeySchema)
