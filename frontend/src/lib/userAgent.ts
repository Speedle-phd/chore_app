/** "Edge on Windows" from a user-agent string; good enough to recognise your own devices. */
export function describeDevice(userAgent: string | null): string {
   if (!userAgent) return 'Unknown device'
   const ua = userAgent
   const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null
   const os = /Windows/.test(ua)
      ? 'Windows'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Android/.test(ua)
          ? 'Android'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null
   if (browser && os) return `${browser} on ${os}`
   return browser ?? os ?? 'Unknown device'
}

export const isMobile = (userAgent: string | null) => Boolean(userAgent && /Mobi|Android|iPhone|iPad/.test(userAgent))
