import { useState } from 'react'
import clsx from 'clsx'
import { Check, RotateCcw } from 'lucide-react'
import AvatarSVG from '../components/avatar/AvatarSVG'
import {
  DEFAULT_AVATAR,
  SKIN_COLORS,
  HAIR_COLORS,
  CLOTHES_COLORS,
  BODY_TYPES,
  EAR_STYLES,
  EYE_STYLES,
  EYEBROW_STYLES,
  NOSE_STYLES,
  MOUTH_STYLES,
  HAIR_STYLES,
  CLOTHES_STYLES,
  ACCESSORY_STYLES,
} from '../components/avatar/types'
import type { AvatarConfig, OptionDef } from '../components/avatar/types'

/* ------------------------------------------------------------------ */
/*  Reusable sub-components for the builder panel                      */
/* ------------------------------------------------------------------ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-pink-700 mb-3">
      <span className="w-1 h-4 bg-pink-500 rounded-full" />
      {children}
    </h3>
  )
}

function ColorPicker({
  colors,
  selected,
  onChange,
}: {
  colors: readonly string[]
  selected: string
  onChange: (c: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={clsx(
            'w-10 h-10 rounded-full border-2 transition-all duration-150 flex items-center justify-center',
            selected === c
              ? 'border-pink-500 ring-2 ring-pink-300 scale-110'
              : 'border-gray-200 hover:scale-105 hover:border-pink-300'
          )}
          style={{ backgroundColor: c }}
          aria-label={`Cor ${c}`}
        >
          {selected === c && (
            <Check className="w-4 h-4 drop-shadow-md" style={{ color: isLight(c) ? '#333' : '#fff' }} />
          )}
        </button>
      ))}
    </div>
  )
}

function OptionCards<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: readonly OptionDef<T>[]
  selected: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            'flex flex-col items-center justify-center px-4 py-3 rounded-xl border-2 text-sm transition-all duration-150 min-w-[80px]',
            selected === opt.value
              ? 'border-pink-500 bg-pink-50 text-pink-700 font-semibold shadow-sm'
              : 'border-gray-200 bg-white text-gray-600 hover:border-pink-300 hover:bg-pink-50/50'
          )}
        >
          {opt.emoji && <span className="text-xl mb-1">{opt.emoji}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** Returns true if hex colour is light enough to need dark text */
function isLight(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 160
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export default function AvatarBuilder() {
  const [config, setConfig] = useState<AvatarConfig>({ ...DEFAULT_AVATAR })

  function update<K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  function reset() {
    setConfig({ ...DEFAULT_AVATAR })
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)] bg-gradient-to-br from-pink-50 via-white to-purple-50">
      {/* ───────── Preview Panel (Left) ───────── */}
      <div className="lg:w-[340px] flex-shrink-0 flex flex-col items-center justify-center p-6 lg:p-8 bg-gradient-to-b from-pink-100/60 to-purple-100/60 lg:border-r border-pink-200/50">
        <div className="relative">
          {/* Background oval glow */}
          <div className="absolute inset-0 -m-6 rounded-[50%] bg-gradient-to-b from-pink-200/50 to-purple-200/50 blur-sm" />
          <div className="relative">
            <AvatarSVG config={config} size={140} />
          </div>
        </div>

        <button
          onClick={reset}
          className="mt-6 flex items-center gap-2 px-4 py-2 text-sm text-pink-600 bg-white rounded-lg border border-pink-200 hover:bg-pink-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Resetar
        </button>
      </div>

      {/* ───────── Builder Panel (Right) ───────── */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8">
        {/* Skin tone */}
        <section>
          <SectionTitle>Tom de Pele</SectionTitle>
          <ColorPicker colors={SKIN_COLORS} selected={config.skinColor} onChange={(c) => update('skinColor', c)} />
        </section>

        {/* Body type */}
        <section>
          <SectionTitle>Tipo de Corpo</SectionTitle>
          <OptionCards options={BODY_TYPES} selected={config.bodyType} onChange={(v) => update('bodyType', v)} />
        </section>

        {/* Ear style */}
        <section>
          <SectionTitle>Estilo das Orelhas</SectionTitle>
          <OptionCards options={EAR_STYLES} selected={config.earStyle} onChange={(v) => update('earStyle', v)} />
        </section>

        {/* Eyes */}
        <section>
          <SectionTitle>Estilo dos Olhos</SectionTitle>
          <OptionCards options={EYE_STYLES} selected={config.eyeStyle} onChange={(v) => update('eyeStyle', v)} />
        </section>

        {/* Eyebrows */}
        <section>
          <SectionTitle>Sobrancelhas</SectionTitle>
          <OptionCards options={EYEBROW_STYLES} selected={config.eyebrowStyle} onChange={(v) => update('eyebrowStyle', v)} />
        </section>

        {/* Nose */}
        <section>
          <SectionTitle>Nariz</SectionTitle>
          <OptionCards options={NOSE_STYLES} selected={config.noseStyle} onChange={(v) => update('noseStyle', v)} />
        </section>

        {/* Mouth */}
        <section>
          <SectionTitle>Boca</SectionTitle>
          <OptionCards options={MOUTH_STYLES} selected={config.mouthStyle} onChange={(v) => update('mouthStyle', v)} />
        </section>

        {/* Hair style */}
        <section>
          <SectionTitle>Estilo do Cabelo</SectionTitle>
          <OptionCards options={HAIR_STYLES} selected={config.hairStyle} onChange={(v) => update('hairStyle', v)} />
        </section>

        {/* Hair colour */}
        <section>
          <SectionTitle>Cor do Cabelo</SectionTitle>
          <ColorPicker colors={HAIR_COLORS} selected={config.hairColor} onChange={(c) => update('hairColor', c)} />
        </section>

        {/* Clothes style */}
        <section>
          <SectionTitle>Roupa</SectionTitle>
          <OptionCards options={CLOTHES_STYLES} selected={config.clothesStyle} onChange={(v) => update('clothesStyle', v)} />
        </section>

        {/* Clothes colour */}
        <section>
          <SectionTitle>Cor da Roupa</SectionTitle>
          <ColorPicker colors={CLOTHES_COLORS} selected={config.clothesColor} onChange={(c) => update('clothesColor', c)} />
        </section>

        {/* Accessories */}
        <section>
          <SectionTitle>Acessórios</SectionTitle>
          <OptionCards options={ACCESSORY_STYLES} selected={config.accessory} onChange={(v) => update('accessory', v)} />
        </section>
      </div>
    </div>
  )
}
