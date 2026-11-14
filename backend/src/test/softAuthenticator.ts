import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers'

// Copies into a plain ArrayBuffer-backed array, the type the helpers expect.
const b64url = (bytes: Uint8Array | string) =>
   isoBase64URL.fromBuffer(new Uint8Array(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes))
const sha256 = (data: Uint8Array) => new Uint8Array(createHash('sha256').update(data).digest())
const u32 = (n: number) => {
   const b = new Uint8Array(4)
   new DataView(b.buffer).setUint32(0, n)
   return b
}
const concat = (...parts: Uint8Array[]) => {
   const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
   let offset = 0
   for (const p of parts) {
      out.set(p, offset)
      offset += p.length
   }
   return out
}

const FLAG_UP = 0x01 // user present
const FLAG_UV = 0x04 // user verified
const FLAG_AT = 0x40 // attested credential data included

/**
 * A minimal software WebAuthn authenticator (ES256, "none" attestation) for
 * tests. Produces the same JSON a browser returns from navigator.credentials.
 */
export function softAuthenticator(opts: { rpID: string; origin: string }) {
   const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
   const credentialId = new Uint8Array(randomBytes(32))
   let counter = 0
   let userHandle: string | null = null

   const coseKey = () => {
      const jwk = publicKey.export({ format: 'jwk' })
      return isoCBOR.encode(
         new Map<number, number | Uint8Array>([
            [1, 2], // kty: EC2
            [3, -7], // alg: ES256
            [-1, 1], // crv: P-256
            [-2, isoBase64URL.toBuffer(jwk.x ?? '')],
            [-3, isoBase64URL.toBuffer(jwk.y ?? '')],
         ]),
      )
   }
   const clientData = (type: string, challenge: string, origin = opts.origin) =>
      new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }))

   return {
      id: b64url(credentialId),

      /** Answer to registration options (navigator.credentials.create). */
      register(options: { challenge: string; user: { id: string } }, overrides: { origin?: string } = {}) {
         userHandle = options.user.id
         const authData = concat(
            sha256(new TextEncoder().encode(opts.rpID)),
            new Uint8Array([FLAG_UP | FLAG_UV | FLAG_AT]),
            u32(counter),
            new Uint8Array(16), // AAGUID
            new Uint8Array([0, credentialId.length]),
            credentialId,
            coseKey(),
         )
         const attestationObject = isoCBOR.encode(
            new Map<string, unknown>([
               ['fmt', 'none'],
               ['attStmt', new Map()],
               ['authData', authData],
            ]) as never,
         )
         return {
            id: b64url(credentialId),
            rawId: b64url(credentialId),
            type: 'public-key' as const,
            response: {
               clientDataJSON: b64url(clientData('webauthn.create', options.challenge, overrides.origin)),
               attestationObject: b64url(attestationObject),
               transports: ['internal'],
            },
            clientExtensionResults: {},
            authenticatorAttachment: 'platform',
         }
      },

      /** Answer to authentication options (navigator.credentials.get). */
      assert(
         options: { challenge: string },
         overrides: { counter?: number; signWith?: KeyObject; userHandle?: string } = {},
      ) {
         counter = overrides.counter ?? counter + 1
         const authData = concat(
            sha256(new TextEncoder().encode(opts.rpID)),
            new Uint8Array([FLAG_UP | FLAG_UV]),
            u32(counter),
         )
         const clientDataJSON = clientData('webauthn.get', options.challenge)
         const signature = sign('sha256', concat(authData, sha256(clientDataJSON)), overrides.signWith ?? privateKey)
         return {
            id: b64url(credentialId),
            rawId: b64url(credentialId),
            type: 'public-key' as const,
            response: {
               clientDataJSON: b64url(clientDataJSON),
               authenticatorData: b64url(authData),
               signature: b64url(new Uint8Array(signature)),
               userHandle: overrides.userHandle ?? userHandle ?? undefined,
            },
            clientExtensionResults: {},
            authenticatorAttachment: 'platform',
         }
      },
   }
}

/** A key pair unrelated to any registered passkey (for forged signatures). */
export const strangerKey = () => generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey
