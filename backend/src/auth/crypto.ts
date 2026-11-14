import { createHash, randomBytes } from 'node:crypto'

/** 256-bit CSPRNG token, URL-safe. Only its hash is ever stored. */
export const randomToken = () => randomBytes(32).toString('base64url')

export const sha256 = (value: string) =>
   createHash('sha256').update(value).digest('hex')
