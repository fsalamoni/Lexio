import { useEffect, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { IS_FIREBASE } from '../lib/firebase'
import { saveUserSettings } from '../lib/firestore-service'
import {
  PLATFORM_SKINS,
  DEFAULT_SKIN_ID,
  findSkin,
  applySkinToDocument,
  clearSkinFromDocument,
  type PlatformSkin,
} from '../lib/platform-skins'

const LOCAL_STORAGE_KEY = 'lexio_platform_skin'

function getStoredSkinId(): string {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY) || DEFAULT_SKIN_ID
  } catch {
    return DEFAULT_SKIN_ID
  }
}

function storeSkinId(id: string): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, id)
  } catch { /* quota exceeded — ignore */ }
}

export function useApplyPlatformSkin() {
  useEffect(() => {
    const skin = findSkin(getStoredSkinId())
    if (skin.id === DEFAULT_SKIN_ID) {
      clearSkinFromDocument()
      return
    }
    applySkinToDocument(skin)
  }, [])
}

function SkinSwatch({ skin, selected, onSelect }: { skin: PlatformSkin; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        group relative flex flex-col gap-3 rounded-[1.4rem] border-2 p-4 text-left transition-all
        ${selected
          ? 'border-[var(--v2-accent-strong)] bg-[rgba(15,118,110,0.06)] shadow-[var(--v2-shadow-soft)]'
          : 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.60)] hover:border-[var(--v2-line-strong)] hover:shadow-[var(--v2-shadow-soft)]'}
      `}
    >
      {selected && (
        <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--v2-accent-strong)] text-white">
          <Check className="h-3.5 w-3.5" />
        </div>
      )}

      <div className="flex gap-1.5">
        {skin.swatches.map((color, i) => (
          <div
            key={i}
            className="h-8 w-8 rounded-full border border-[rgba(0,0,0,0.08)]"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{skin.label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--v2-ink-soft)]">{skin.description}</p>
      </div>
    </button>
  )
}

export default function ThemeSkinSelector() {
  const { userId } = useAuth()
  const [activeSkin, setActiveSkin] = useState<string>(getStoredSkinId)
  const [saving, setSaving] = useState(false)

  const handleSelect = async (skin: PlatformSkin) => {
    setActiveSkin(skin.id)
    storeSkinId(skin.id)

    if (skin.id === DEFAULT_SKIN_ID) {
      clearSkinFromDocument()
    } else {
      applySkinToDocument(skin)
    }

    if (IS_FIREBASE && userId) {
      setSaving(true)
      try {
        await saveUserSettings(userId, { platform_skin: skin.id })
      } catch { /* ignore — local storage is the fallback */ }
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Palette className="h-5 w-5 text-[var(--v2-accent-strong)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">Aparencia da plataforma</p>
          <p className="text-xs text-[var(--v2-ink-soft)]">
            Escolha um tema de cores para personalizar o visual do workspace.
            {saving && <span className="ml-2 text-[var(--v2-accent-strong)]">Salvando...</span>}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORM_SKINS.map((skin) => (
          <SkinSwatch
            key={skin.id}
            skin={skin}
            selected={activeSkin === skin.id}
            onSelect={() => void handleSelect(skin)}
          />
        ))}
      </div>
    </div>
  )
}
