import { useEffect, useState } from 'react'
export function useThrottle(value: any, limit: number) {
   const [throttledValue, setThrottledValue] = useState(value)

   useEffect(() => {
      let lastRan = Date.now()
      const handler = setInterval(() => {
         if (Date.now() - lastRan >= limit) {
            setThrottledValue(value)
            lastRan = Date.now()
         }
      }, limit)

      return () => {
         clearInterval(handler)
      }
   }, [value, limit])

   return throttledValue
}
