/**
 * Firestore-backed admin settings store.
 *
 * Stores API keys in: /settings/api_keys  (Firestore document)
 * Falls back to in-memory defaults when Firebase is not configured.
 */

import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { firestore, IS_FIREBASE } from './firebase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiKeyEntry {
  key: string
  label: string
  description: string
  placeholder: string
  link: string
  guide: string[]
  is_auto: boolean
  default_value?: string
  // runtime state (derived from Firestore)
  is_set: boolean
  masked_value: string | null
  source: string
}

// ── Static definitions ─────────────────────────────────────────────────────────

export const API_KEY_DEFINITIONS: Omit<ApiKeyEntry, 'is_set' | 'masked_value' | 'source'>[] = [
  {
    key: 'openrouter_api_key',
    label: 'OpenRouter API Key',
    description:
      'Chave para acesso aos modelos LLM (Claude Sonnet, Haiku, GPT-4o, etc.) via OpenRouter.ai. ' +
      'Necessária para que o pipeline de geração de documentos funcione.',
    placeholder: 'sk-or-v1-…',
    link: 'https://openrouter.ai/keys',
    guide: [
      'Acesse https://openrouter.ai e crie uma conta gratuita (botão "Sign Up" no canto superior direito).',
      'Após o login, clique no menu lateral em "Keys" (ícone de chave).',
      'Clique no botão "+ Create Key", dê um nome como "Lexio" e confirme.',
      'A chave aparece no formato sk-or-v1-XXXXX. Copie-a AGORA — ela não é exibida novamente.',
      'Cole a chave no campo acima e clique em "Salvar alterações".',
      'Em "Credits" no painel do OpenRouter, adicione créditos para consumo dos modelos (mínimo $5,00).',
      'Modelos usados: claude-sonnet-4-6 (agentes principais) e claude-haiku-4-5 (triagem rápida).',
    ],
    is_auto: false,
  },
  {
    key: 'evolution_api_key',
    label: 'Evolution API Key',
    description:
      'Chave para integração WhatsApp via Evolution API. ' +
      'Necessária apenas se quiser usar o bot conversacional de WhatsApp.',
    placeholder: 'sua-api-key-da-evolution',
    link: 'https://doc.evolution-api.com',
    guide: [
      'Instale a Evolution API no seu servidor: docker run -d -p 8080:8080 atendai/evolution-api:latest',
      'Acesse o painel: http://SEU_SERVIDOR:8080 (substitua pelo IP ou domínio do servidor).',
      'No painel, vá em "Manager" → "Instances" → clique em "+ New Instance".',
      'Dê o nome "lexio" à instância. A API Key será gerada automaticamente — copie-a.',
      'Cole a API Key no campo acima e clique em "Salvar alterações".',
      'No arquivo .env do backend Lexio, defina EVOLUTION_API_URL=http://SEU_SERVIDOR:8080 e WHATSAPP_ENABLED=true.',
      'Para conectar o WhatsApp: na instância "lexio", clique em "Connect" e escaneie o QR Code com o celular.',
      'Configure o webhook da instância: http://SEU_BACKEND:8000/webhook/evolution',
    ],
    is_auto: false,
  },
  {
    key: 'datajud_api_key',
    label: 'DataJud API Key (CNJ)',
    description:
      'Chave para consulta de jurisprudência via DataJud — base pública do CNJ com mais de ' +
      '100 milhões de processos judiciais. Já vem pré-configurada com a chave pública padrão.',
    placeholder: 'cnjKey=…',
    link: 'https://datajud-wiki.cnj.jus.br',
    guide: [
      'Esta chave já vem pré-configurada com a chave pública padrão do CNJ. Nenhuma ação necessária para começar.',
      'Se precisar de quota maior, acesse https://datajud-wiki.cnj.jus.br e solicite acesso personalizado.',
      'Clique em "Solicitar Acesso" e preencha o formulário com os dados do escritório ou órgão.',
      'Após aprovação (2–5 dias úteis), você receberá uma chave personalizada por e-mail no formato cnjKey=XXXXX.',
      'Substitua o valor padrão pela sua chave personalizada e clique em "Salvar alterações".',
    ],
    is_auto: true,
    default_value: 'cnjKey=APIKey=2026',
  },
]

const SETTINGS_DOC = 'api_keys'

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskValue(value: string): string {
  if (!value || value.length <= 8) return '•'.repeat(Math.min(value?.length ?? 8, 8))
  return value.slice(0, 6) + '•'.repeat(Math.max(value.length - 10, 4)) + value.slice(-4)
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadApiKeys(): Promise<ApiKeyEntry[]> {
  let stored: Record<string, string> = {}

  if (IS_FIREBASE && firestore) {
    try {
      const snap = await getDoc(doc(firestore, 'settings', SETTINGS_DOC))
      if (snap.exists()) {
        const data = snap.data()
        // Exclude meta-fields
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'string') stored[k] = v
        }
      }
    } catch (e) {
      console.warn('Firestore load failed:', e)
    }
  }

  return API_KEY_DEFINITIONS.map((def) => {
    const raw = stored[def.key] ?? def.default_value ?? ''
    const isSet = Boolean(raw)
    return {
      ...def,
      is_set: isSet,
      masked_value: isSet ? maskValue(raw) : null,
      source: stored[def.key]
        ? 'banco de dados'
        : def.default_value
          ? 'padrão (CNJ)'
          : 'não configurado',
    }
  })
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveApiKeys(updates: Record<string, string>): Promise<void> {
  if (!IS_FIREBASE || !firestore) {
    // In demo mode: just log — nothing persists
    console.info('Demo mode — API keys not persisted:', updates)
    return
  }

  const ref  = doc(firestore, 'settings', SETTINGS_DOC)
  const snap = await getDoc(ref)

  if (snap.exists()) {
    await updateDoc(ref, { ...updates, updated_at: serverTimestamp() })
  } else {
    // First save — also pre-populate DataJud default
    const datajudDef = API_KEY_DEFINITIONS.find((d) => d.key === 'datajud_api_key')
    const initial: Record<string, unknown> = { updated_at: serverTimestamp() }
    if (datajudDef?.default_value) initial['datajud_api_key'] = datajudDef.default_value
    await setDoc(ref, { ...initial, ...updates })
  }
}
