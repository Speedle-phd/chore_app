import { useId } from 'react'
import { cn } from '@/lib/utils'
import type { BadgeAccessory, BadgeAnimalId } from './statsApi'

/*
 * Badge art (user request 2026-11-16: a pet theme): eight animals as flat round
 * faces on a 64×64 grid, plus accessories that say what the badge was for. Fixed
 * colours (animals look the same in every theme); badges not yet earned are shown
 * in grey with a lock. Decorative: the badge's name is always written next to it.
 */

const INK = '#2B2B2B'
const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const Cheeks = ({ y = 42, dx = 11, color = '#F59AAE' }: { y?: number; dx?: number; color?: string }) => (
   <g fill={color} opacity={0.55}>
      <circle cx={32 - dx} cy={y} r={2.4} />
      <circle cx={32 + dx} cy={y} r={2.4} />
   </g>
)

/** Round eyes with a highlight, at ±dx from the middle. */
const Eyes = ({ y, dx, r = 2.1, color = INK }: { y: number; dx: number; r?: number; color?: string }) => (
   <g>
      {[-1, 1].map((side) => (
         <g key={side}>
            <circle cx={32 + side * dx} cy={y} r={r} fill={color} />
            <circle cx={32 + side * dx + r * 0.35} cy={y - r * 0.4} r={r * 0.35} fill='#fff' />
         </g>
      ))}
   </g>
)

const ANIMALS: Record<BadgeAnimalId, { bg: string; art: React.ReactNode }> = {
   panda: {
      bg: '#D9EEE3',
      art: (
         <g>
            <circle cx={19} cy={21} r={7} fill={INK} />
            <circle cx={45} cy={21} r={7} fill={INK} />
            <circle cx={32} cy={36} r={19} fill='#FFFFFF' />
            <ellipse cx={24.5} cy={34} rx={5} ry={6.5} transform='rotate(-25 24.5 34)' fill={INK} />
            <ellipse cx={39.5} cy={34} rx={5} ry={6.5} transform='rotate(25 39.5 34)' fill={INK} />
            <circle cx={25.3} cy={33.6} r={2} fill='#fff' />
            <circle cx={38.7} cy={33.6} r={2} fill='#fff' />
            <circle cx={25.6} cy={33.8} r={1} fill={INK} />
            <circle cx={38.4} cy={33.8} r={1} fill={INK} />
            <ellipse cx={32} cy={41.5} rx={3} ry={2} fill={INK} />
            <path d='M29.5 44.6q2.5 2 5 0' stroke={INK} strokeWidth={1.3} {...line} />
            <Cheeks y={43} dx={12} />
         </g>
      ),
   },
   koala: {
      bg: '#E2E7F3',
      art: (
         <g>
            <circle cx={15} cy={27} r={10} fill='#8F98A6' />
            <circle cx={15.5} cy={27.5} r={6} fill='#EADDE3' />
            <circle cx={49} cy={27} r={10} fill='#8F98A6' />
            <circle cx={48.5} cy={27.5} r={6} fill='#EADDE3' />
            <circle cx={32} cy={37} r={18} fill='#A6AFBC' />
            <Eyes y={34} dx={7.5} />
            <ellipse cx={32} cy={41.5} rx={4.6} ry={6.2} fill='#3B3F46' />
            <ellipse cx={30.6} cy={38.8} rx={1.2} ry={1.7} fill='#fff' opacity={0.35} />
            <Cheeks y={42} dx={11.5} />
         </g>
      ),
   },
   seal: {
      bg: '#D7E9F5',
      art: (
         <g>
            <circle cx={32} cy={36} r={20} fill='#A9BCC8' />
            <ellipse cx={32} cy={28} rx={13} ry={7} fill='#B9CAD4' />
            <ellipse cx={28.4} cy={43} rx={5.2} ry={4.3} fill='#D6E1E8' />
            <ellipse cx={35.6} cy={43} rx={5.2} ry={4.3} fill='#D6E1E8' />
            <ellipse cx={32} cy={40} rx={2.6} ry={1.8} fill='#2F3A43' />
            <Eyes y={33} dx={8} r={3.3} color='#22303A' />
            <g fill='#6B7F8C'>
               <circle cx={26.5} cy={42.5} r={0.65} />
               <circle cx={25.5} cy={44.6} r={0.65} />
               <circle cx={37.5} cy={42.5} r={0.65} />
               <circle cx={38.5} cy={44.6} r={0.65} />
            </g>
            <Cheeks y={39} dx={14} />
         </g>
      ),
   },
   icebear: {
      bg: '#DCE8F6',
      art: (
         <g>
            <circle cx={19} cy={21} r={6.5} fill='#F7F4EC' stroke='#D8D0BF' strokeWidth={1.2} />
            <circle cx={19} cy={21} r={3.2} fill='#E7DECB' />
            <circle cx={45} cy={21} r={6.5} fill='#F7F4EC' stroke='#D8D0BF' strokeWidth={1.2} />
            <circle cx={45} cy={21} r={3.2} fill='#E7DECB' />
            <circle cx={32} cy={36} r={19} fill='#F7F4EC' stroke='#D8D0BF' strokeWidth={1.4} />
            <ellipse cx={32} cy={42} rx={8.5} ry={6.5} fill='#FFFFFF' stroke='#E4DCCB' strokeWidth={1} />
            <ellipse cx={32} cy={39.6} rx={3.2} ry={2.2} fill={INK} />
            <path d='M29.6 44.2q2.4 1.8 4.8 0' stroke={INK} strokeWidth={1.2} {...line} />
            <Eyes y={33} dx={7} r={2} />
            <Cheeks y={41} dx={12.5} />
         </g>
      ),
   },
   racoon: {
      bg: '#E6E2F3',
      art: (
         <g>
            <path d='M14 27 18 10l10 9z' fill='#7C8592' />
            <path d='M17.5 22.5 19 14.5l5 4.6z' fill='#3F4650' />
            <path d='M50 27 46 10l-10 9z' fill='#7C8592' />
            <path d='M46.5 22.5 45 14.5l-5 4.6z' fill='#3F4650' />
            <circle cx={32} cy={36} r={19} fill='#9BA3AE' />
            <path d='M15 37q17-12 34 0-2 14-17 15-15-1-17-15z' fill='#F1F3F5' />
            <path d='M14.5 33q8-7 15-1 2.5 2 5 0 7-6 15 1-2 7-8 7-5 0-9.5-3.5-4.5 3.5-9.5 3.5-6 0-8-7z' fill='#3A414B' />
            <circle cx={24} cy={34} r={2.3} fill='#fff' />
            <circle cx={40} cy={34} r={2.3} fill='#fff' />
            <circle cx={24.3} cy={34.3} r={1.2} fill={INK} />
            <circle cx={39.7} cy={34.3} r={1.2} fill={INK} />
            <path d='M32 18.5v7' stroke='#7C8592' strokeWidth={3} {...line} />
            <ellipse cx={32} cy={42.4} rx={2.8} ry={2} fill='#2D3138' />
            <path d='M30 45.2q2 1.5 4 0' stroke='#2D3138' strokeWidth={1.1} {...line} />
         </g>
      ),
   },
   dog: {
      bg: '#F5E8D3',
      art: (
         <g>
            <ellipse cx={15.5} cy={34} rx={6.5} ry={12} transform='rotate(18 15.5 34)' fill='#8A5A36' />
            <ellipse cx={48.5} cy={34} rx={6.5} ry={12} transform='rotate(-18 48.5 34)' fill='#8A5A36' />
            <circle cx={32} cy={35} r={17.5} fill='#E0A86B' />
            <ellipse cx={40} cy={27.5} rx={4.2} ry={3.2} fill='#C98C52' />
            <ellipse cx={32} cy={42} rx={9} ry={7} fill='#F6DDB8' />
            <path d='M30 45.4q2 4.2 4 0z' fill='#F28B95' />
            <ellipse cx={32} cy={38.8} rx={3.4} ry={2.4} fill='#3A2A20' />
            <path d='M28.8 44.6q3.2 1.8 6.4 0' stroke='#3A2A20' strokeWidth={1.2} {...line} />
            <Eyes y={32} dx={7} color='#3A2A20' />
         </g>
      ),
   },
   owl: {
      bg: '#F2E5D3',
      art: (
         <g>
            <path d='M16 19 13.5 9l9.5 6.2zM48 19l2.5-10-9.5 6.2z' fill='#7D5239' />
            <path d='M14 31q0-17 18-17t18 17v7q0 15-18 15T14 38z' fill='#9C6B4E' />
            <path d='M17 31q15-10 30 0 0 12-15 14-15-2-15-14z' fill='#E8D2B8' />
            {[25, 39].map((cx) => (
               <g key={cx}>
                  <circle cx={cx} cy={31} r={6.6} fill='#fff' stroke='#7D5239' strokeWidth={1.2} />
                  <circle cx={cx} cy={31} r={3.9} fill='#F2A93B' />
                  <circle cx={cx} cy={31} r={2.1} fill='#2A1E17' />
                  <circle cx={cx + 1} cy={30} r={0.8} fill='#fff' />
               </g>
            ))}
            <path d='m32 35.5-2.5 3 2.5 3.5 2.5-3.5z' fill='#F2A93B' />
            <path d='M26 48.5l2 1.6 2-1.6M34 48.5l2 1.6 2-1.6M30 51.5l2 1.4 2-1.4' stroke='#7D5239' strokeWidth={1.1} {...line} />
         </g>
      ),
   },
   cat: {
      bg: '#FBE4D3',
      art: (
         <g>
            <path d='M15 29 17 11l12 9z' fill='#F09A4E' />
            <path d='M18 24.5 19.2 15.5l6 4.6z' fill='#F7C6CF' />
            <path d='M49 29 47 11l-12 9z' fill='#F09A4E' />
            <path d='M46 24.5 44.8 15.5l-6 4.6z' fill='#F7C6CF' />
            <circle cx={32} cy={36} r={18.5} fill='#F4A95E' />
            <path d='M28 20v5M32 19v6.5M36 20v5' stroke='#D9803A' strokeWidth={2} {...line} />
            <ellipse cx={32} cy={42} rx={7.5} ry={5.2} fill='#FCE3C8' />
            <ellipse cx={25} cy={34} rx={2.1} ry={2.7} fill='#2B2420' />
            <ellipse cx={39} cy={34} rx={2.1} ry={2.7} fill='#2B2420' />
            <circle cx={25.7} cy={33} r={0.8} fill='#fff' />
            <circle cx={39.7} cy={33} r={0.8} fill='#fff' />
            <path d='M30.4 39.6h3.2L32 41.6z' fill='#E8768A' />
            <path d='M29.4 42.6q2.6 2 2.6 0 0 2 2.6 0' stroke='#9C5A2E' strokeWidth={1.1} {...line} />
            <path d='M22 41.5 13.5 39.5M22 43.6l-8.2 1.4M42 41.5l8.5-2M42 43.6l8.2 1.4' stroke='#B97A47' strokeWidth={0.9} {...line} />
         </g>
      ),
   },
}

const Star = ({ x, y, r, fill = '#F7C548' }: { x: number; y: number; r: number; fill?: string }) => (
   <path
      d={`M${x} ${y - r}l${r * 0.29} ${r * 0.6} ${r * 0.66} ${r * 0.1}-${r * 0.48} ${r * 0.46} ${r * 0.12} ${r * 0.66}-${r * 0.59}-${r * 0.31}-${r * 0.59} ${r * 0.31} ${r * 0.12}-${r * 0.66}-${r * 0.48}-${r * 0.46} ${r * 0.66}-${r * 0.1}z`}
      fill={fill}
      stroke='#D79F21'
      strokeWidth={0.6}
      strokeLinejoin='round'
   />
)

/** A heart about 2·s wide, centred on (x, y). */
const Heart = ({ x, y, s }: { x: number; y: number; s: number }) => {
   const k = s / 10
   return (
      <path
         d='M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.5 5c2.1 0 3.6 1.1 5.5 3.2C13.9 6.1 15.4 5 17.5 5 21 5 23 8.6 21.6 11.8 19.5 16.4 12 21 12 21z'
         transform={`translate(${x - 12 * k} ${y - 13 * k}) scale(${k})`}
         fill='#F0627D'
         stroke='#C7405B'
         strokeWidth={0.6 / k}
         strokeLinejoin='round'
      />
   )
}

function Accessory({ id }: { id: BadgeAccessory }) {
   switch (id) {
      case 'none':
         return null
      case 'sparkles':
         return (
            <g>
               <path d='M52 9.5c.6 3 1.6 4 4.6 4.6-3 .6-4 1.6-4.6 4.6-.6-3-1.6-4-4.6-4.6 3-.6 4-1.6 4.6-4.6z' fill='#F7C548' />
               <path d='M11 44c.4 2 1 2.6 3 3-2 .4-2.6 1-3 3-.4-2-1-2.6-3-3 2-.4 2.6-1 3-3z' fill='#F7C548' />
               <circle cx={47} cy={22} r={1.1} fill='#F7C548' />
            </g>
         )
      case 'medal':
         return (
            <g>
               <path d='M44.5 41.5 42 49h5l2.5-5.5zM53.5 41.5 56 49h-5l-2.5-5.5z' fill='#E5484D' />
               <circle cx={49} cy={51} r={6.2} fill='#F2C14E' stroke='#C9962A' strokeWidth={1.1} />
               <Star x={49} y={51.4} r={3.6} fill='#FFF3C4' />
            </g>
         )
      case 'crown':
         return (
            <g>
               <path d='m21.5 18.5 2-10.5 5 5.5L32 5.5l3.5 8 5-5.5 2 10.5z' fill='#F2C14E' stroke='#C9962A' strokeWidth={1.1} strokeLinejoin='round' />
               <circle cx={32} cy={14.5} r={1.5} fill='#E5484D' />
               <circle cx={26} cy={16} r={1.1} fill='#3B82F6' />
               <circle cx={38} cy={16} r={1.1} fill='#3B82F6' />
            </g>
         )
      case 'glasses':
         return (
            <g stroke='#2A1E17' strokeWidth={1.6} fill='none'>
               <circle cx={25} cy={31} r={7.8} />
               <circle cx={39} cy={31} r={7.8} />
               <path d='M30.5 29.5q1.5-1.4 3 0' strokeLinecap='round' />
            </g>
         )
      case 'headband':
         return (
            <g>
               <path d='M14.2 28.5q17.8-10 35.6 0' stroke='#E5484D' strokeWidth={4.2} {...line} />
               <path d='M48.5 27.5l6 -2.5M48.5 28.5l5.5 3' stroke='#E5484D' strokeWidth={2.4} {...line} />
            </g>
         )
      case 'heart':
         return <Heart x={50.5} y={48} s={4.4} />
      case 'hearts':
         return (
            <g>
               <Heart x={50.5} y={48} s={4.4} />
               <Heart x={12.5} y={47} s={3.2} />
               <Heart x={52} y={13} s={2.6} />
            </g>
         )
      case 'sun':
         return (
            <g>
               <g stroke='#F2B33D' strokeWidth={1.6} strokeLinecap='round'>
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                     <path key={a} d='M52 4.5v2.6' transform={`rotate(${a} 52 13)`} />
                  ))}
               </g>
               <circle cx={52} cy={13} r={4.6} fill='#F7C548' />
            </g>
         )
      case 'flame':
         return (
            <g>
               <path d='M50 40c1 3 3.3 4.4 4.8 6.6 1.3 1.8 1.9 3.4 1.9 5.3 0 4-3.2 6.6-6.7 6.6s-6.7-2.6-6.7-6.6c0-2.3 1-4.1 2.3-5.5.2 1.6.9 2.7 2 3.3-.6-3.4.2-6.6 2.4-9.7z' fill='#E07A3A' />
               <path d='M50 48.5c.4 1.2 1.2 2 2 2.8.8.9 1.3 1.8 1.3 3 0 2-1.5 3.4-3.3 3.4s-3.3-1.4-3.3-3.4c0-1.2.5-2.1 1.2-2.8.1.9.5 1.5 1.1 1.8-.3-1.8.1-3.3 1-4.8z' fill='#F7C548' />
            </g>
         )
      case 'moon':
         return (
            <g>
               <path d='M54.5 6.5a8 8 0 1 0 2.8 13.6 6.4 6.4 0 1 1-2.8-13.6z' fill='#F5D76E' stroke='#D7B23F' strokeWidth={0.7} />
               <Star x={44} y={9} r={1.8} />
               <Star x={58} y={26} r={1.4} />
            </g>
         )
      case 'shades':
         return (
            <g>
               <rect x={17} y={29} width={13} height={8} rx={3.2} fill='#1F2933' />
               <rect x={34} y={29} width={13} height={8} rx={3.2} fill='#1F2933' />
               <path d='M30 31.5h4' stroke='#1F2933' strokeWidth={1.6} />
               <path d='M19.5 31l3 -1.2M36.5 31l3 -1.2' stroke='#fff' strokeOpacity={0.55} strokeWidth={1.1} strokeLinecap='round' />
            </g>
         )
      case 'star':
         return <Star x={51} y={13} r={6} />
   }
}

/**
 * A badge's animal with its accessory. Not yet earned: grey and faded, with a
 * small lock, so the reward is visible but clearly still to come.
 */
export function BadgeAnimal({
   animal,
   accessory,
   earned,
   className,
}: {
   animal: BadgeAnimalId
   accessory: BadgeAccessory
   earned: boolean
   className?: string
}) {
   const clip = useId()
   const { bg, art } = ANIMALS[animal] ?? ANIMALS.cat
   return (
      <svg viewBox='0 0 64 64' aria-hidden className={cn('shrink-0', className)}>
         <defs>
            <clipPath id={clip}>
               <circle cx={32} cy={32} r={31} />
            </clipPath>
         </defs>
         <g className={cn(!earned && 'opacity-45 grayscale')}>
            <circle cx={32} cy={32} r={31} fill={bg} />
            <g clipPath={`url(#${clip})`}>{art}</g>
            <Accessory id={accessory} />
         </g>
         {!earned && (
            <g>
               <circle cx={51} cy={51} r={9} fill='#4B5563' stroke='#fff' strokeWidth={2} />
               <rect x={46.6} y={50} width={8.8} height={6.6} rx={1.4} fill='#fff' />
               <path d='M48.4 50v-2.2a2.6 2.6 0 0 1 5.2 0V50' stroke='#fff' strokeWidth={1.5} fill='none' />
            </g>
         )}
      </svg>
   )
}
