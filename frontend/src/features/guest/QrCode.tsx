import { useMemo } from 'react'
import { encode } from 'uqr'
import { cn } from '@/lib/utils'

/** Quiet zone around the code: 4 modules, as the QR standard (ISO/IEC 18004) asks. */
const QUIET = 4

/**
 * A QR code as an SVG (black on white in every theme: scanners need the contrast and the light
 * border). `label` names it for screen readers; the text it encodes is shown elsewhere.
 */
export function QrCode({ text, label, className }: { text: string; label: string; className?: string }) {
   const { size, path } = useMemo(() => {
      const { data } = encode(text, { ecc: 'M', border: 0 })
      let d = ''
      data.forEach((row, y) =>
         row.forEach((dark, x) => {
            if (dark) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`
         }),
      )
      return { size: data.length + QUIET * 2, path: d }
   }, [text])

   return (
      <svg
         role='img'
         aria-label={label}
         viewBox={`0 0 ${size} ${size}`}
         shapeRendering='crispEdges'
         className={cn('aspect-square rounded-lg', className)}
      >
         <rect width={size} height={size} fill='#ffffff' />
         <path d={path} fill='#000000' />
      </svg>
   )
}
