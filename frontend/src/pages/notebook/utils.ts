/**
 * Utility functions for the Research Notebook feature.
 * Extracted from ResearchNotebook.tsx for modularity.
 */

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function getExtensionFromMimeType(mimeType?: string, fallback = '.bin'): string {
  if (!mimeType) return fallback
  const value = mimeType.toLowerCase()
  if (value.includes('video/mp4')) return '.mp4'
  if (value.includes('video/webm')) return '.webm'
  if (value.includes('video/ogg')) return '.ogv'
  if (value.includes('video/quicktime')) return '.mov'
  if (value.includes('audio/wav') || value.includes('audio/x-wav')) return '.wav'
  if (value.includes('audio/mpeg') || value.includes('audio/mp3')) return '.mp3'
  if (value.includes('audio/ogg')) return '.ogg'
  if (value.includes('audio/webm')) return '.weba'
  if (value.includes('audio/aac')) return '.aac'
  if (value.includes('image/png')) return '.png'
  if (value.includes('image/jpeg') || value.includes('image/jpg')) return '.jpg'
  if (value.includes('image/webp')) return '.webp'
  return fallback
}

// ── Lightweight Markdown renderer ─────────────────────────────────────────────

/** Escape HTML entities to prevent XSS when rendering markdown. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only allow http/https links — block javascript:, data:, etc. */
function sanitizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return '#'
}

/**
 * Converts basic Markdown to sanitised HTML for assistant messages.
 * Supports: headers, bold, italic, inline code, code blocks, lists, links, hr.
 * All text content is HTML-escaped before transformation to prevent XSS.
 * Only assistant LLM output passes through this function.
 */
export function renderMarkdownToHtml(md: string): string {
  // First, extract code blocks and inline code to protect them from HTML escaping
  const codeBlocks: string[] = []
  let safe = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const idx = codeBlocks.length
    codeBlocks.push(`<pre class="bg-gray-800 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-xs"><code>${escapeHtml(code)}</code></pre>`)
    return `\x00CODEBLOCK${idx}\x00`
  })

  const inlineCodes: string[] = []
  safe = safe.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = inlineCodes.length
    inlineCodes.push(`<code class="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-xs">${escapeHtml(code)}</code>`)
    return `\x00INLINECODE${idx}\x00`
  })

  // Escape remaining HTML entities
  safe = escapeHtml(safe)

  let html = safe
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 class="font-semibold text-gray-900 mt-3 mb-1 text-sm">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-gray-900 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-gray-900 mt-4 mb-1 text-base">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-gray-900 mt-4 mb-2 text-lg">$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rule
    .replace(/^---+$/gm, '<hr class="my-3 border-gray-200" />')
    // Links [text](url) — only allow http/https
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
      `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer" class="text-teal-600 hover:underline">${text}</a>`,
    )
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks (double newline -> paragraph break)
    .replace(/\n\n/g, '</p><p class="mt-2">')
    // Single line breaks within paragraphs
    .replace(/\n/g, '<br />')

  // Restore code blocks and inline codes
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_m, idx) => codeBlocks[Number(idx)])
  html = html.replace(/\x00INLINECODE(\d+)\x00/g, (_m, idx) => inlineCodes[Number(idx)])

  return `<p>${html}</p>`
}
