import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ME_KEY } from '@/api/client'
import { useMe, type User } from '@/features/auth/authApi'
import { viewerTimeZone } from '@/features/calendar/time'

/**
 * Saves the browser's time zone on the account when it differs (first visit,
 * travel, moving), so the daily reminder digest goes out at 08:00 local time.
 * Silent: no toast, no error shown; it simply tries again next visit.
 */
export function useSyncTimezone() {
   const me = useMe()
   const queryClient = useQueryClient()
   const current = me.data?.timezone
   useEffect(() => {
      if (!me.data) return
      const zone = viewerTimeZone()
      if (!zone || current === zone) return
      api
         .patch<User>('/account', { timezone: zone })
         .then(({ data }) => queryClient.setQueryData(ME_KEY, data))
         .catch(() => {})
   }, [me.data, current, queryClient])
}
