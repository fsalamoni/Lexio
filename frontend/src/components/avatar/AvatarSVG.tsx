import type { AvatarConfig } from './types'

interface Props {
  config: AvatarConfig
  size?: number
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers – all coordinates target a 200 × 420 viewBox     */
/* ------------------------------------------------------------------ */

const HEAD = { cx: 100, cy: 78, r: 38 }

function bodyMetrics(type: AvatarConfig['bodyType']) {
  switch (type) {
    case 'round':
      return { x: 52, y: 132, w: 96, h: 124, rx: 16, armDx: 10, legW: 22 }
    case 'slim':
      return { x: 72, y: 132, w: 56, h: 118, rx: 10, armDx: -5, legW: 14 }
    default: // normal
      return { x: 62, y: 132, w: 76, h: 118, rx: 12, armDx: 0, legW: 18 }
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-layer renderers                                                */
/* ------------------------------------------------------------------ */

function BodyLayer({ config }: { config: AvatarConfig }) {
  const { skinColor, bodyType } = config
  const b = bodyMetrics(bodyType)
  const stroke = '#1a1a2e'
  const sw = 2.2

  const leftArmEnd = { x: 32 - b.armDx, y: 252 }
  const rightArmEnd = { x: 168 + b.armDx, y: 252 }
  const legBottom = 362
  const leftLegX = 100 - b.legW
  const rightLegX = 100 + b.legW

  return (
    <g id="body-layer">
      {/* Legs */}
      <rect x={leftLegX - 8} y={b.y + b.h - 8} width={16} height={legBottom - b.y - b.h + 8}
        rx={6} fill={skinColor} stroke={stroke} strokeWidth={sw} />
      <rect x={rightLegX - 8} y={b.y + b.h - 8} width={16} height={legBottom - b.y - b.h + 8}
        rx={6} fill={skinColor} stroke={stroke} strokeWidth={sw} />

      {/* Feet */}
      <ellipse cx={leftLegX} cy={legBottom + 4} rx={16} ry={8}
        fill={skinColor} stroke={stroke} strokeWidth={sw} />
      <ellipse cx={rightLegX} cy={legBottom + 4} rx={16} ry={8}
        fill={skinColor} stroke={stroke} strokeWidth={sw} />

      {/* Arms */}
      <path
        d={`M ${b.x + 4},${b.y + 22}
            C ${b.x - 10},${b.y + 40} ${leftArmEnd.x + 4},${leftArmEnd.y - 40} ${leftArmEnd.x},${leftArmEnd.y}`}
        fill="none" stroke={skinColor} strokeWidth={16} strokeLinecap="round" />
      <path
        d={`M ${b.x + 4},${b.y + 22}
            C ${b.x - 10},${b.y + 40} ${leftArmEnd.x + 4},${leftArmEnd.y - 40} ${leftArmEnd.x},${leftArmEnd.y}`}
        fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray="0" style={{ filter: 'none' }} />

      <path
        d={`M ${b.x + b.w - 4},${b.y + 22}
            C ${b.x + b.w + 10},${b.y + 40} ${rightArmEnd.x - 4},${rightArmEnd.y - 40} ${rightArmEnd.x},${rightArmEnd.y}`}
        fill="none" stroke={skinColor} strokeWidth={16} strokeLinecap="round" />
      <path
        d={`M ${b.x + b.w - 4},${b.y + 22}
            C ${b.x + b.w + 10},${b.y + 40} ${rightArmEnd.x - 4},${rightArmEnd.y - 40} ${rightArmEnd.x},${rightArmEnd.y}`}
        fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />

      {/* Hands */}
      <circle cx={leftArmEnd.x} cy={leftArmEnd.y + 4} r={10}
        fill={skinColor} stroke={stroke} strokeWidth={sw} />
      <circle cx={rightArmEnd.x} cy={rightArmEnd.y + 4} r={10}
        fill={skinColor} stroke={stroke} strokeWidth={sw} />

      {/* Torso */}
      <rect x={b.x} y={b.y} width={b.w} height={b.h}
        rx={b.rx} fill={skinColor} stroke={stroke} strokeWidth={sw} />

      {/* Neck */}
      <rect x={90} y={110} width={20} height={28}
        rx={4} fill={skinColor} stroke={stroke} strokeWidth={sw} />

      {/* Head */}
      <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r}
        fill={skinColor} stroke={stroke} strokeWidth={sw} />
    </g>
  )
}

function EarsLayer({ config }: { config: AvatarConfig }) {
  const { skinColor, earStyle } = config
  if (earStyle === 'none') return null
  const stroke = '#1a1a2e'
  const sw = 2.2
  const y = HEAD.cy

  switch (earStyle) {
    case 'round':
      return (
        <g id="ears-layer">
          <circle cx={HEAD.cx - HEAD.r - 4} cy={y} r={8} fill={skinColor} stroke={stroke} strokeWidth={sw} />
          <circle cx={HEAD.cx + HEAD.r + 4} cy={y} r={8} fill={skinColor} stroke={stroke} strokeWidth={sw} />
        </g>
      )
    case 'pointed':
      return (
        <g id="ears-layer">
          <polygon points={`${HEAD.cx - HEAD.r - 2},${y + 8} ${HEAD.cx - HEAD.r - 14},${y - 14} ${HEAD.cx - HEAD.r + 4},${y - 6}`}
            fill={skinColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <polygon points={`${HEAD.cx + HEAD.r + 2},${y + 8} ${HEAD.cx + HEAD.r + 14},${y - 14} ${HEAD.cx + HEAD.r - 4},${y - 6}`}
            fill={skinColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </g>
      )
    case 'big':
      return (
        <g id="ears-layer">
          <ellipse cx={HEAD.cx - HEAD.r - 6} cy={y} rx={12} ry={16}
            fill={skinColor} stroke={stroke} strokeWidth={sw} />
          <ellipse cx={HEAD.cx + HEAD.r + 6} cy={y} rx={12} ry={16}
            fill={skinColor} stroke={stroke} strokeWidth={sw} />
        </g>
      )
    default:
      return null
  }
}

function EyesLayer({ config }: { config: AvatarConfig }) {
  const { eyeStyle } = config
  const y = HEAD.cy - 4
  const leftX = HEAD.cx - 14
  const rightX = HEAD.cx + 14
  const fill = '#1a1a2e'

  switch (eyeStyle) {
    case 'round':
      return (
        <g id="eyes-layer">
          <circle cx={leftX} cy={y} r={5} fill={fill} />
          <circle cx={rightX} cy={y} r={5} fill={fill} />
          <circle cx={leftX + 1.5} cy={y - 1.5} r={1.5} fill="#fff" />
          <circle cx={rightX + 1.5} cy={y - 1.5} r={1.5} fill="#fff" />
        </g>
      )
    case 'oval':
      return (
        <g id="eyes-layer">
          <ellipse cx={leftX} cy={y} rx={6} ry={4} fill={fill} />
          <ellipse cx={rightX} cy={y} rx={6} ry={4} fill={fill} />
          <circle cx={leftX + 1.5} cy={y - 1} r={1.5} fill="#fff" />
          <circle cx={rightX + 1.5} cy={y - 1} r={1.5} fill="#fff" />
        </g>
      )
    case 'big':
      return (
        <g id="eyes-layer">
          <circle cx={leftX} cy={y} r={8} fill="#fff" stroke={fill} strokeWidth={2} />
          <circle cx={rightX} cy={y} r={8} fill="#fff" stroke={fill} strokeWidth={2} />
          <circle cx={leftX + 1} cy={y} r={4} fill={fill} />
          <circle cx={rightX + 1} cy={y} r={4} fill={fill} />
          <circle cx={leftX + 2} cy={y - 1.5} r={1.5} fill="#fff" />
          <circle cx={rightX + 2} cy={y - 1.5} r={1.5} fill="#fff" />
        </g>
      )
    case 'small':
      return (
        <g id="eyes-layer">
          <circle cx={leftX} cy={y} r={3} fill={fill} />
          <circle cx={rightX} cy={y} r={3} fill={fill} />
        </g>
      )
    case 'sleepy':
      return (
        <g id="eyes-layer">
          <path d={`M ${leftX - 5},${y} Q ${leftX},${y + 4} ${leftX + 5},${y}`}
            fill="none" stroke={fill} strokeWidth={2.5} strokeLinecap="round" />
          <path d={`M ${rightX - 5},${y} Q ${rightX},${y + 4} ${rightX + 5},${y}`}
            fill="none" stroke={fill} strokeWidth={2.5} strokeLinecap="round" />
        </g>
      )
    default:
      return null
  }
}

function EyebrowsLayer({ config }: { config: AvatarConfig }) {
  const { eyebrowStyle } = config
  if (eyebrowStyle === 'none') return null
  const y = HEAD.cy - 16
  const leftX = HEAD.cx - 14
  const rightX = HEAD.cx + 14
  const stroke = '#1a1a2e'

  switch (eyebrowStyle) {
    case 'normal':
      return (
        <g id="eyebrows-layer">
          <path d={`M ${leftX - 6},${y} Q ${leftX},${y - 3} ${leftX + 6},${y}`}
            fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
          <path d={`M ${rightX - 6},${y} Q ${rightX},${y - 3} ${rightX + 6},${y}`}
            fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        </g>
      )
    case 'thick':
      return (
        <g id="eyebrows-layer">
          <path d={`M ${leftX - 7},${y + 1} Q ${leftX},${y - 4} ${leftX + 7},${y + 1}`}
            fill="none" stroke={stroke} strokeWidth={3.5} strokeLinecap="round" />
          <path d={`M ${rightX - 7},${y + 1} Q ${rightX},${y - 4} ${rightX + 7},${y + 1}`}
            fill="none" stroke={stroke} strokeWidth={3.5} strokeLinecap="round" />
        </g>
      )
    case 'thin':
      return (
        <g id="eyebrows-layer">
          <path d={`M ${leftX - 6},${y} Q ${leftX},${y - 2} ${leftX + 6},${y}`}
            fill="none" stroke={stroke} strokeWidth={1.2} strokeLinecap="round" />
          <path d={`M ${rightX - 6},${y} Q ${rightX},${y - 2} ${rightX + 6},${y}`}
            fill="none" stroke={stroke} strokeWidth={1.2} strokeLinecap="round" />
        </g>
      )
    case 'arched':
      return (
        <g id="eyebrows-layer">
          <path d={`M ${leftX - 7},${y + 2} Q ${leftX - 2},${y - 6} ${leftX + 7},${y}`}
            fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
          <path d={`M ${rightX - 7},${y} Q ${rightX + 2},${y - 6} ${rightX + 7},${y + 2}`}
            fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        </g>
      )
    default:
      return null
  }
}

function NoseLayer({ config }: { config: AvatarConfig }) {
  const { noseStyle } = config
  const cx = HEAD.cx
  const cy = HEAD.cy + 8
  const stroke = '#1a1a2e'

  switch (noseStyle) {
    case 'small':
      return (
        <g id="nose-layer">
          <circle cx={cx} cy={cy} r={2.5} fill={stroke} />
        </g>
      )
    case 'medium':
      return (
        <g id="nose-layer">
          <path d={`M ${cx},${cy - 5} L ${cx - 5},${cy + 3} Q ${cx},${cy + 5} ${cx + 5},${cy + 3} Z`}
            fill={stroke} opacity={0.6} />
        </g>
      )
    case 'big':
      return (
        <g id="nose-layer">
          <ellipse cx={cx} cy={cy + 2} rx={6} ry={5} fill={stroke} opacity={0.5} />
        </g>
      )
    case 'pointed':
      return (
        <g id="nose-layer">
          <path d={`M ${cx},${cy - 6} L ${cx - 4},${cy + 4} L ${cx + 4},${cy + 4} Z`}
            fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
        </g>
      )
    default:
      return null
  }
}

function MouthLayer({ config }: { config: AvatarConfig }) {
  const { mouthStyle } = config
  const cx = HEAD.cx
  const cy = HEAD.cy + 20
  const stroke = '#1a1a2e'

  switch (mouthStyle) {
    case 'smile':
      return (
        <g id="mouth-layer">
          <path d={`M ${cx - 10},${cy} Q ${cx},${cy + 10} ${cx + 10},${cy}`}
            fill="none" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
        </g>
      )
    case 'neutral':
      return (
        <g id="mouth-layer">
          <line x1={cx - 8} y1={cy + 2} x2={cx + 8} y2={cy + 2}
            stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
        </g>
      )
    case 'open':
      return (
        <g id="mouth-layer">
          <ellipse cx={cx} cy={cy + 2} rx={7} ry={5}
            fill="#8B0000" stroke={stroke} strokeWidth={2} />
          <ellipse cx={cx} cy={cy + 4} rx={5} ry={2.5} fill="#CC3333" />
        </g>
      )
    case 'smirk':
      return (
        <g id="mouth-layer">
          <path d={`M ${cx - 8},${cy + 2} Q ${cx + 2},${cy + 6} ${cx + 10},${cy - 1}`}
            fill="none" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
        </g>
      )
    default:
      return null
  }
}

function HairLayer({ config }: { config: AvatarConfig }) {
  const { hairStyle, hairColor } = config
  if (hairStyle === 'bald') return null
  const stroke = '#1a1a2e'
  const sw = 2

  const cx = HEAD.cx
  const cy = HEAD.cy
  const r = HEAD.r

  switch (hairStyle) {
    case 'short':
      return (
        <g id="hair-layer">
          <path
            d={`M ${cx - r - 2},${cy - 6}
                Q ${cx - r - 4},${cy - r - 12} ${cx},${cy - r - 10}
                Q ${cx + r + 4},${cy - r - 12} ${cx + r + 2},${cy - 6}`}
            fill={hairColor} stroke={stroke} strokeWidth={sw} />
          <path
            d={`M ${cx - r + 2},${cy - 2}
                Q ${cx - r},${cy - r - 6} ${cx},${cy - r - 4}
                Q ${cx + r},${cy - r - 6} ${cx + r - 2},${cy - 2}`}
            fill={hairColor} />
        </g>
      )
    case 'long':
      return (
        <g id="hair-layer">
          {/* Top hair covering head */}
          <path
            d={`M ${cx - r - 4},${cy + 2}
                Q ${cx - r - 6},${cy - r - 14} ${cx},${cy - r - 12}
                Q ${cx + r + 6},${cy - r - 14} ${cx + r + 4},${cy + 2}`}
            fill={hairColor} stroke={stroke} strokeWidth={sw} />
          <path
            d={`M ${cx - r},${cy + 2}
                Q ${cx - r + 2},${cy - r - 8} ${cx},${cy - r - 6}
                Q ${cx + r - 2},${cy - r - 8} ${cx + r},${cy + 2}`}
            fill={hairColor} />
          {/* Hair flowing down on left */}
          <path
            d={`M ${cx - r - 4},${cy + 2}
                C ${cx - r - 8},${cy + 30} ${cx - r - 10},${cy + 70} ${cx - r + 2},${cy + 100}`}
            fill="none" stroke={hairColor} strokeWidth={16} strokeLinecap="round" />
          <path
            d={`M ${cx - r - 4},${cy + 2}
                C ${cx - r - 8},${cy + 30} ${cx - r - 10},${cy + 70} ${cx - r + 2},${cy + 100}`}
            fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          {/* Hair flowing down on right */}
          <path
            d={`M ${cx + r + 4},${cy + 2}
                C ${cx + r + 8},${cy + 30} ${cx + r + 10},${cy + 70} ${cx + r - 2},${cy + 100}`}
            fill="none" stroke={hairColor} strokeWidth={16} strokeLinecap="round" />
          <path
            d={`M ${cx + r + 4},${cy + 2}
                C ${cx + r + 8},${cy + 30} ${cx + r + 10},${cy + 70} ${cx + r - 2},${cy + 100}`}
            fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </g>
      )
    case 'curly':
      return (
        <g id="hair-layer">
          <path
            d={`M ${cx - r - 4},${cy}
                Q ${cx - r - 8},${cy - r - 14} ${cx},${cy - r - 12}
                Q ${cx + r + 8},${cy - r - 14} ${cx + r + 4},${cy}`}
            fill={hairColor} stroke={stroke} strokeWidth={sw} />
          <path
            d={`M ${cx - r},${cy + 2}
                Q ${cx - r + 2},${cy - r - 6} ${cx},${cy - r - 5}
                Q ${cx + r - 2},${cy - r - 6} ${cx + r},${cy + 2}`}
            fill={hairColor} />
          {/* Curly bumps */}
          {[-30, -15, 0, 15, 30].map((angle) => {
            const rad = ((angle - 90) * Math.PI) / 180
            const bx = cx + (r + 6) * Math.cos(rad)
            const by = cy + (r + 6) * Math.sin(rad)
            return <circle key={angle} cx={bx} cy={by} r={7} fill={hairColor} stroke={stroke} strokeWidth={sw * 0.6} />
          })}
        </g>
      )
    case 'mohawk':
      return (
        <g id="hair-layer">
          <path
            d={`M ${cx - 8},${cy - r + 4}
                L ${cx - 6},${cy - r - 30}
                Q ${cx},${cy - r - 36} ${cx + 6},${cy - r - 30}
                L ${cx + 8},${cy - r + 4} Z`}
            fill={hairColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          {/* Base of mohawk on head */}
          <ellipse cx={cx} cy={cy - r + 6} rx={10} ry={6} fill={hairColor} />
        </g>
      )
    case 'ponytail':
      return (
        <g id="hair-layer">
          {/* Top hair */}
          <path
            d={`M ${cx - r - 2},${cy - 6}
                Q ${cx - r - 4},${cy - r - 10} ${cx},${cy - r - 8}
                Q ${cx + r + 4},${cy - r - 10} ${cx + r + 2},${cy - 6}`}
            fill={hairColor} stroke={stroke} strokeWidth={sw} />
          <path
            d={`M ${cx - r + 2},${cy - 2}
                Q ${cx - r},${cy - r - 4} ${cx},${cy - r - 3}
                Q ${cx + r},${cy - r - 4} ${cx + r - 2},${cy - 2}`}
            fill={hairColor} />
          {/* Ponytail behind */}
          <path
            d={`M ${cx + 10},${cy - r + 2}
                C ${cx + r + 20},${cy - r + 10} ${cx + r + 22},${cy + 10} ${cx + r + 10},${cy + 50}`}
            fill="none" stroke={hairColor} strokeWidth={12} strokeLinecap="round" />
          <path
            d={`M ${cx + 10},${cy - r + 2}
                C ${cx + r + 20},${cy - r + 10} ${cx + r + 22},${cy + 10} ${cx + r + 10},${cy + 50}`}
            fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          {/* Hair tie */}
          <circle cx={cx + 14} cy={cy - r + 4} r={4} fill="#E91E63" stroke={stroke} strokeWidth={1} />
        </g>
      )
    case 'bun':
      return (
        <g id="hair-layer">
          {/* Base hair on head */}
          <path
            d={`M ${cx - r - 2},${cy - 6}
                Q ${cx - r - 4},${cy - r - 10} ${cx},${cy - r - 8}
                Q ${cx + r + 4},${cy - r - 10} ${cx + r + 2},${cy - 6}`}
            fill={hairColor} stroke={stroke} strokeWidth={sw} />
          <path
            d={`M ${cx - r + 2},${cy - 2}
                Q ${cx - r},${cy - r - 4} ${cx},${cy - r - 3}
                Q ${cx + r},${cy - r - 4} ${cx + r - 2},${cy - 2}`}
            fill={hairColor} />
          {/* Bun on top */}
          <circle cx={cx} cy={cy - r - 14} r={14}
            fill={hairColor} stroke={stroke} strokeWidth={sw} />
        </g>
      )
    default:
      return null
  }
}

function ClothesLayer({ config }: { config: AvatarConfig }) {
  const { clothesStyle, clothesColor, bodyType } = config
  const b = bodyMetrics(bodyType)
  const stroke = '#1a1a2e'
  const sw = 2.2

  switch (clothesStyle) {
    case 'tshirt':
      return (
        <g id="clothes-layer">
          {/* Torso cover */}
          <rect x={b.x} y={b.y} width={b.w} height={b.h}
            rx={b.rx} fill={clothesColor} stroke={stroke} strokeWidth={sw} />
          {/* Short sleeves */}
          <path
            d={`M ${b.x},${b.y + 8}
                L ${b.x - 18 - b.armDx},${b.y + 30}
                L ${b.x - 14 - b.armDx},${b.y + 50}
                L ${b.x},${b.y + 36} Z`}
            fill={clothesColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <path
            d={`M ${b.x + b.w},${b.y + 8}
                L ${b.x + b.w + 18 + b.armDx},${b.y + 30}
                L ${b.x + b.w + 14 + b.armDx},${b.y + 50}
                L ${b.x + b.w},${b.y + 36} Z`}
            fill={clothesColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          {/* Collar / neckline */}
          <path
            d={`M ${90},${b.y + 2} Q ${100},${b.y + 14} ${110},${b.y + 2}`}
            fill={config.skinColor} stroke={stroke} strokeWidth={sw * 0.8} />
        </g>
      )
    case 'suit':
      return (
        <g id="clothes-layer">
          {/* Jacket body */}
          <rect x={b.x - 2} y={b.y} width={b.w + 4} height={b.h + 4}
            rx={b.rx} fill={clothesColor} stroke={stroke} strokeWidth={sw} />
          {/* Lapels */}
          <path
            d={`M ${92},${b.y} L ${88},${b.y + 40} L ${100},${b.y + 20} L ${112},${b.y + 40} L ${108},${b.y} Z`}
            fill="#fff" stroke={stroke} strokeWidth={sw * 0.6} />
          {/* Sleeves */}
          <path
            d={`M ${b.x - 2},${b.y + 8}
                L ${b.x - 22 - b.armDx},${b.y + 35}
                L ${b.x - 16 - b.armDx},${b.y + 80}
                L ${b.x - 2},${b.y + 55} Z`}
            fill={clothesColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <path
            d={`M ${b.x + b.w + 2},${b.y + 8}
                L ${b.x + b.w + 22 + b.armDx},${b.y + 35}
                L ${b.x + b.w + 16 + b.armDx},${b.y + 80}
                L ${b.x + b.w + 2},${b.y + 55} Z`}
            fill={clothesColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          {/* Tie */}
          <path
            d={`M ${97},${b.y + 14} L ${100},${b.y + 55} L ${103},${b.y + 14} Z`}
            fill="#C62828" stroke={stroke} strokeWidth={1} />
          {/* Buttons */}
          <circle cx={100} cy={b.y + 60} r={2} fill="#fff" stroke={stroke} strokeWidth={0.8} />
          <circle cx={100} cy={b.y + 74} r={2} fill="#fff" stroke={stroke} strokeWidth={0.8} />
        </g>
      )
    case 'dress':
      return (
        <g id="clothes-layer">
          {/* Dress top */}
          <rect x={b.x} y={b.y} width={b.w} height={b.h * 0.4}
            rx={b.rx} fill={clothesColor} stroke={stroke} strokeWidth={sw} />
          {/* Dress skirt (flares out) */}
          <path
            d={`M ${b.x},${b.y + b.h * 0.35}
                L ${b.x - 16},${b.y + b.h + 40}
                Q ${100},${b.y + b.h + 50} ${b.x + b.w + 16},${b.y + b.h + 40}
                L ${b.x + b.w},${b.y + b.h * 0.35} Z`}
            fill={clothesColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          {/* Neckline */}
          <path
            d={`M ${88},${b.y + 2} Q ${100},${b.y + 16} ${112},${b.y + 2}`}
            fill={config.skinColor} stroke={stroke} strokeWidth={sw * 0.8} />
          {/* Straps */}
          <line x1={88} y1={b.y} x2={92} y2={b.y - 18}
            stroke={clothesColor} strokeWidth={4} strokeLinecap="round" />
          <line x1={112} y1={b.y} x2={108} y2={b.y - 18}
            stroke={clothesColor} strokeWidth={4} strokeLinecap="round" />
          <line x1={88} y1={b.y} x2={92} y2={b.y - 18}
            stroke={stroke} strokeWidth={sw * 0.6} strokeLinecap="round" />
          <line x1={112} y1={b.y} x2={108} y2={b.y - 18}
            stroke={stroke} strokeWidth={sw * 0.6} strokeLinecap="round" />
        </g>
      )
    case 'hoodie':
      return (
        <g id="clothes-layer">
          {/* Hoodie body */}
          <rect x={b.x - 2} y={b.y} width={b.w + 4} height={b.h + 4}
            rx={b.rx + 2} fill={clothesColor} stroke={stroke} strokeWidth={sw} />
          {/* Long sleeves */}
          <path
            d={`M ${b.x - 2},${b.y + 8}
                L ${b.x - 22 - b.armDx},${b.y + 35}
                L ${b.x - 18 - b.armDx},${b.y + 95}
                L ${b.x - 2},${b.y + 65} Z`}
            fill={clothesColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <path
            d={`M ${b.x + b.w + 2},${b.y + 8}
                L ${b.x + b.w + 22 + b.armDx},${b.y + 35}
                L ${b.x + b.w + 18 + b.armDx},${b.y + 95}
                L ${b.x + b.w + 2},${b.y + 65} Z`}
            fill={clothesColor} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          {/* Hood behind head */}
          <path
            d={`M ${HEAD.cx - HEAD.r - 8},${HEAD.cy + 8}
                Q ${HEAD.cx - HEAD.r - 16},${HEAD.cy - HEAD.r - 6} ${HEAD.cx},${HEAD.cy - HEAD.r - 10}
                Q ${HEAD.cx + HEAD.r + 16},${HEAD.cy - HEAD.r - 6} ${HEAD.cx + HEAD.r + 8},${HEAD.cy + 8}`}
            fill={clothesColor} stroke={stroke} strokeWidth={sw} opacity={0.7} />
          {/* Kangaroo pocket */}
          <rect x={b.x + 10} y={b.y + b.h * 0.5} width={b.w - 20} height={b.h * 0.24}
            rx={6} fill="none" stroke={stroke} strokeWidth={sw * 0.6} opacity={0.6} />
          {/* Strings */}
          <line x1={94} y1={b.y + 2} x2={92} y2={b.y + 30}
            stroke={stroke} strokeWidth={1.2} />
          <line x1={106} y1={b.y + 2} x2={108} y2={b.y + 30}
            stroke={stroke} strokeWidth={1.2} />
        </g>
      )
    case 'tank':
      return (
        <g id="clothes-layer">
          {/* Tank body */}
          <rect x={b.x + 6} y={b.y} width={b.w - 12} height={b.h}
            rx={b.rx - 2} fill={clothesColor} stroke={stroke} strokeWidth={sw} />
          {/* Straps */}
          <line x1={b.x + 12} y1={b.y} x2={b.x + 16} y2={b.y - 20}
            stroke={clothesColor} strokeWidth={6} strokeLinecap="round" />
          <line x1={b.x + b.w - 12} y1={b.y} x2={b.x + b.w - 16} y2={b.y - 20}
            stroke={clothesColor} strokeWidth={6} strokeLinecap="round" />
          <line x1={b.x + 12} y1={b.y} x2={b.x + 16} y2={b.y - 20}
            stroke={stroke} strokeWidth={sw * 0.6} strokeLinecap="round" />
          <line x1={b.x + b.w - 12} y1={b.y} x2={b.x + b.w - 16} y2={b.y - 20}
            stroke={stroke} strokeWidth={sw * 0.6} strokeLinecap="round" />
          {/* Neckline scoop */}
          <path
            d={`M ${b.x + 12},${b.y + 2} Q ${100},${b.y + 18} ${b.x + b.w - 12},${b.y + 2}`}
            fill={config.skinColor} stroke={stroke} strokeWidth={sw * 0.6} />
        </g>
      )
    default:
      return null
  }
}

function AccessoryLayer({ config }: { config: AvatarConfig }) {
  const { accessory } = config
  if (accessory === 'none') return null
  const stroke = '#1a1a2e'
  const sw = 2
  const cx = HEAD.cx
  const cy = HEAD.cy
  const r = HEAD.r

  switch (accessory) {
    case 'glasses':
      return (
        <g id="accessory-layer">
          <circle cx={cx - 14} cy={cy - 4} r={10} fill="none" stroke={stroke} strokeWidth={sw} />
          <circle cx={cx + 14} cy={cy - 4} r={10} fill="none" stroke={stroke} strokeWidth={sw} />
          <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy - 4} stroke={stroke} strokeWidth={sw} />
          <line x1={cx - 24} y1={cy - 4} x2={cx - r} y2={cy - 8} stroke={stroke} strokeWidth={sw} />
          <line x1={cx + 24} y1={cy - 4} x2={cx + r} y2={cy - 8} stroke={stroke} strokeWidth={sw} />
        </g>
      )
    case 'hat':
      return (
        <g id="accessory-layer">
          {/* Hat brim */}
          <ellipse cx={cx} cy={cy - r + 4} rx={r + 16} ry={6}
            fill="#37474F" stroke={stroke} strokeWidth={sw} />
          {/* Hat top */}
          <path
            d={`M ${cx - r + 6},${cy - r + 4}
                Q ${cx - r + 4},${cy - r - 22} ${cx},${cy - r - 26}
                Q ${cx + r - 4},${cy - r - 22} ${cx + r - 6},${cy - r + 4} Z`}
            fill="#37474F" stroke={stroke} strokeWidth={sw} />
          {/* Hat band */}
          <path
            d={`M ${cx - r + 6},${cy - r + 2} Q ${cx},${cy - r - 2} ${cx + r - 6},${cy - r + 2}`}
            fill="none" stroke="#C62828" strokeWidth={3} />
        </g>
      )
    case 'earring':
      return (
        <g id="accessory-layer">
          <circle cx={cx - r - 4} cy={cy + 12} r={4} fill="#FFD700" stroke={stroke} strokeWidth={1} />
          <circle cx={cx + r + 4} cy={cy + 12} r={4} fill="#FFD700" stroke={stroke} strokeWidth={1} />
          <circle cx={cx - r - 4} cy={cy + 12} r={1.5} fill="#E91E63" />
          <circle cx={cx + r + 4} cy={cy + 12} r={1.5} fill="#E91E63" />
        </g>
      )
    case 'necklace':
      return (
        <g id="accessory-layer">
          <path
            d={`M ${cx - 18},${112} Q ${cx},${130} ${cx + 18},${112}`}
            fill="none" stroke="#FFD700" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={cx} cy={128} r={4} fill="#E91E63" stroke="#FFD700" strokeWidth={1.5} />
        </g>
      )
    case 'headband':
      return (
        <g id="accessory-layer">
          <path
            d={`M ${cx - r - 2},${cy - 10}
                Q ${cx},${cy - r - 6} ${cx + r + 2},${cy - 10}`}
            fill="none" stroke="#E91E63" strokeWidth={4} strokeLinecap="round" />
          {/* Small bow */}
          <path
            d={`M ${cx + r - 4},${cy - r + 2}
                L ${cx + r + 4},${cy - r - 4}
                L ${cx + r + 8},${cy - r + 6}
                L ${cx + r},${cy - r + 4} Z`}
            fill="#E91E63" stroke={stroke} strokeWidth={0.8} />
        </g>
      )
    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/*  Main exported component                                            */
/* ------------------------------------------------------------------ */

export default function AvatarSVG({ config, size = 300 }: Props) {
  return (
    <svg
      viewBox="0 0 200 420"
      width={size}
      height={size * 2.1}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Avatar personalizado"
    >
      {/* Layer 1 – Body (skin fill + outlines) */}
      <BodyLayer config={config} />

      {/* Layer 2 – Clothes (covers torso) */}
      <ClothesLayer config={config} />

      {/* Layer 3 – Ears */}
      <EarsLayer config={config} />

      {/* Layer 4 – Eyes */}
      <EyesLayer config={config} />

      {/* Layer 5 – Eyebrows */}
      <EyebrowsLayer config={config} />

      {/* Layer 6 – Nose */}
      <NoseLayer config={config} />

      {/* Layer 7 – Mouth */}
      <MouthLayer config={config} />

      {/* Layer 8 – Hair (on top of head) */}
      <HairLayer config={config} />

      {/* Layer 9 – Accessories (topmost) */}
      <AccessoryLayer config={config} />
    </svg>
  )
}
