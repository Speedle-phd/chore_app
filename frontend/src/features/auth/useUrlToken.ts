import { useEffect, useState } from 'react'

/**
 * Reads `?token=` once and removes it from the address bar, so the one-time
 * token doesn't stay in history, bookmarks or screenshots.
 */
export function useUrlToken(): string | null {
   const [token] = useState(() =>
      new URLSearchParams(window.location.search).get('token'),
   )
   useEffect(() => {
      if (!token) return
      const url = new URL(window.location.href)
      url.searchParams.delete('token')
      window.history.replaceState(window.history.state, '', url)
   }, [token])
   return token
}
