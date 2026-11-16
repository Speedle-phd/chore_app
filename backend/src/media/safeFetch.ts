import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import zlib from 'node:zlib'

/**
 * Fetching a user-given URL from the server without letting it reach internal
 * services (SSRF; OWASP SSRF Prevention Cheat Sheet):
 * - http/https only, default ports only;
 * - every resolved address is checked against private/reserved ranges, and the
 *   connection uses the checked address (no second DNS answer: DNS rebinding);
 * - redirects are followed by hand (≤ 3) and each target is checked again;
 * - timeouts and a size cap; content types are checked by the caller.
 */

export class SafeFetchError extends Error {}

const blocked = new BlockList()
for (const [net, prefix] of [
   ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
   ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
   ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
   ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6')

/** Private, loopback, link-local, CGNAT, documentation, multicast or reserved (IPv4-mapped IPv6 checked as IPv4). */
export function isBlockedAddress(address: string): boolean {
   const family = isIP(address)
   if (family === 0) return true
   const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
   if (mapped?.[1]) return blocked.check(mapped[1], 'ipv4')
   return blocked.check(address, family === 6 ? 'ipv6' : 'ipv4')
}

export type SafeFetchOptions = {
   maxBytes: number
   timeoutMs?: number
   maxRedirects?: number
   accept?: string
   /** Tests only: allow an address the default rules block (e.g. a local test server). */
   allowAddress?: (address: string) => boolean
   /** Tests only: allow ports other than 80/443 (a local test server's random port). */
   allowAnyPort?: boolean
}

export type SafeResponse = { url: string; contentType: string; body: Buffer }

const USER_AGENT = 'HearthRecipeImport/1.0'

export async function safeFetch(rawUrl: string, options: SafeFetchOptions): Promise<SafeResponse> {
   const { maxBytes, timeoutMs = 10_000, maxRedirects = 3, accept = '*/*' } = options
   const allowed = (address: string) => options.allowAddress?.(address) ?? !isBlockedAddress(address)
   const parse = (raw: string) => parseUrl(raw, options.allowAnyPort === true)
   let url = parse(rawUrl)
   for (let hop = 0; ; hop++) {
      const res = await request(url, { maxBytes, timeoutMs, accept, allowed })
      if (res.redirect) {
         if (hop >= maxRedirects) throw new SafeFetchError('Too many redirects.')
         url = parse(new URL(res.redirect, url).toString())
         continue
      }
      return { url: url.toString(), contentType: res.contentType, body: res.body }
   }
}

function parseUrl(raw: string, anyPort: boolean): URL {
   let url: URL
   try {
      url = new URL(raw)
   } catch {
      throw new SafeFetchError('That isn’t a web address.')
   }
   if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SafeFetchError('Only http and https links work.')
   if (!anyPort && url.port && url.port !== '80' && url.port !== '443') throw new SafeFetchError('Only standard web ports work.')
   if (url.username || url.password) throw new SafeFetchError('Links with a password don’t work.')
   return url
}

type Hop = { contentType: string; body: Buffer; redirect: string | null }

function request(url: URL, o: { maxBytes: number; timeoutMs: number; accept: string; allowed: (a: string) => boolean }): Promise<Hop> {
   // Resolve, check every answer, connect only to a checked one.
   const lookup: LookupFunction = (hostname, opts, callback) => {
      dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
         if (err) return callback(err, '', 4)
         const list = addresses as LookupAddress[]
         const bad = list.find((a) => !o.allowed(a.address))
         if (bad || !list.length) return callback(new SafeFetchError('That address isn’t reachable from here.'), '', 4)
         if ((opts as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list)
         const first = list[0] as LookupAddress
         callback(null, first.address, first.family)
      })
   }
   // A literal IP skips DNS: check it directly.
   const host = url.hostname.replace(/^\[|\]$/g, '')
   if (isIP(host) && !o.allowed(host)) return Promise.reject(new SafeFetchError('That address isn’t reachable from here.'))

   return new Promise<Hop>((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http
      const req = client.get(
         url,
         {
            lookup,
            timeout: o.timeoutMs,
            headers: { 'user-agent': USER_AGENT, accept: o.accept, 'accept-encoding': 'gzip, deflate, br', 'accept-language': 'de,en;q=0.8' },
         },
         (res) => {
            const status = res.statusCode ?? 0
            if (status >= 300 && status < 400 && res.headers.location) {
               res.resume()
               return resolve({ contentType: '', body: Buffer.alloc(0), redirect: res.headers.location })
            }
            if (status < 200 || status >= 300) {
               res.resume()
               return reject(new SafeFetchError(`The website answered with an error (${status}).`))
            }
            const declared = Number(res.headers['content-length'])
            if (declared > o.maxBytes) {
               res.destroy()
               return reject(new SafeFetchError('That page is too large.'))
            }
            const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase()
            const stream =
               encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : encoding === 'deflate' ? res.pipe(zlib.createInflate()) : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res
            const chunks: Buffer[] = []
            let size = 0
            stream.on('data', (chunk: Buffer) => {
               size += chunk.length
               // Counted after decompression, so a small gzip bomb can't get through either.
               if (size > o.maxBytes) {
                  req.destroy()
                  stream.destroy()
                  reject(new SafeFetchError('That page is too large.'))
                  return
               }
               chunks.push(chunk)
            })
            stream.on('end', () => resolve({ contentType: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks), redirect: null }))
            stream.on('error', () => reject(new SafeFetchError('The website’s answer couldn’t be read.')))
         },
      )
      req.on('timeout', () => req.destroy(new SafeFetchError('The website took too long to answer.')))
      req.on('error', (err) => reject(err instanceof SafeFetchError ? err : new SafeFetchError('The website couldn’t be reached.')))
   })
}
