/**
 * Design Studio — deterministic, client-side scaffold generation.
 *
 * This is the foundation slice of the Design Studio feature (behind
 * `FF_DESIGN_STUDIO`). It turns a text brief plus an artifact kind into a
 * self-contained HTML document that can be previewed in an iframe and exported.
 *
 * The generation here is intentionally deterministic and offline (no LLM / no
 * network) so the studio has a safe, zero-cost baseline. Later phases layer an
 * LLM design agent, template import/export, design cloning from URLs and
 * repository binding on top of this same preview/export contract.
 */

export type DesignArtifactKind =
  | 'slides'
  | 'site'
  | 'app'
  | 'wireframe'
  | 'document'
  | 'animation'

export interface DesignArtifactKindMeta {
  kind: DesignArtifactKind
  label: string
  description: string
}

/** Ordered catalog of the artifact kinds the studio can scaffold. */
export const DESIGN_ARTIFACT_KINDS: DesignArtifactKindMeta[] = [
  { kind: 'slides', label: 'Slides', description: 'Deck de apresentação com capa e tópicos.' },
  { kind: 'site', label: 'Site (web)', description: 'Landing page responsiva com hero e seções.' },
  { kind: 'app', label: 'App (mobile)', description: 'Protótipo de tela em moldura de celular.' },
  { kind: 'wireframe', label: 'Wireframe', description: 'Esqueleto de baixa fidelidade em tons de cinza.' },
  { kind: 'document', label: 'Documento', description: 'Documento formatado com títulos e parágrafos.' },
  { kind: 'animation', label: 'Animação', description: 'Cena animada com CSS keyframes.' },
]

export function isDesignArtifactKind(value: unknown): value is DesignArtifactKind {
  return typeof value === 'string' && DESIGN_ARTIFACT_KINDS.some((entry) => entry.kind === value)
}

export function describeDesignArtifactKind(kind: DesignArtifactKind): string {
  return DESIGN_ARTIFACT_KINDS.find((entry) => entry.kind === kind)?.label ?? kind
}

/** Escapes text for safe interpolation into generated HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Derives a short, human title from a free-text brief. */
export function deriveTitle(brief: string): string {
  const cleaned = brief.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Projeto de design'
  const firstSentence = cleaned.split(/[.!?\n]/)[0].trim() || cleaned
  const words = firstSentence.split(' ').slice(0, 8).join(' ')
  return words.length > 72 ? `${words.slice(0, 69)}...` : words
}

/** Splits a brief into candidate bullet points / sections. */
export function derivePoints(brief: string, max = 5): string[] {
  const cleaned = brief.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  const parts = cleaned
    .split(/[.;\n]|(?:\s-\s)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const unique: string[] = []
  for (const part of parts) {
    if (!unique.includes(part)) unique.push(part)
    if (unique.length >= max) break
  }
  return unique
}

const PALETTE = {
  ink: '#0f172a',
  soft: '#475569',
  accent: '#0f766e',
  accentSoft: '#ccfbf1',
  canvas: '#f8fafc',
  line: '#e2e8f0',
}

function pageShell(title: string, body: string, style: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:${PALETTE.ink};background:${PALETTE.canvas};line-height:1.5}
${style}
</style>
</head>
<body>
${body}
</body>
</html>`
}

function renderSlides(title: string, points: string[]): string {
  const slides = [
    `<section class="slide cover"><p class="eyebrow">Apresentação</p><h1>${escapeHtml(title)}</h1></section>`,
    ...points.map(
      (point, index) =>
        `<section class="slide"><p class="num">${String(index + 1).padStart(2, '0')}</p><h2>${escapeHtml(point)}</h2></section>`,
    ),
  ].join('\n')
  const style = `
.slide{min-height:56.25vw;max-height:70vh;display:flex;flex-direction:column;justify-content:center;padding:8vw;border-bottom:1px solid ${PALETTE.line}}
.cover{background:${PALETTE.ink};color:#fff}
.eyebrow{text-transform:uppercase;letter-spacing:.24em;font-size:12px;opacity:.7;margin-bottom:16px}
.num{color:${PALETTE.accent};font-weight:700;letter-spacing:.2em;margin-bottom:12px}
h1{font-size:44px;line-height:1.1}
h2{font-size:30px;color:${PALETTE.ink}}`
  return pageShell(title, slides, style)
}

function renderSite(title: string, points: string[]): string {
  const features = points
    .map((point) => `<article class="card"><span class="dot"></span><p>${escapeHtml(point)}</p></article>`)
    .join('\n')
  const body = `
<header class="nav"><strong>${escapeHtml(title)}</strong><nav><a>Recursos</a><a>Preços</a><a class="cta">Começar</a></nav></header>
<section class="hero"><h1>${escapeHtml(title)}</h1><p>Landing gerada a partir do seu briefing.</p><button class="cta-btn">Solicitar acesso</button></section>
<section class="grid">${features}</section>
<footer>© ${new Date().getFullYear()} · Gerado no Design Studio</footer>`
  const style = `
.nav{display:flex;align-items:center;justify-content:space-between;padding:20px 6vw;border-bottom:1px solid ${PALETTE.line}}
.nav nav{display:flex;gap:20px;align-items:center}
.nav a{color:${PALETTE.soft};text-decoration:none;font-size:14px}
.cta{color:${PALETTE.accent};font-weight:600}
.hero{text-align:center;padding:10vw 6vw;background:${PALETTE.accentSoft}}
.hero h1{font-size:46px;max-width:720px;margin:0 auto 16px}
.hero p{color:${PALETTE.soft};font-size:18px;margin-bottom:24px}
.cta-btn{background:${PALETTE.accent};color:#fff;border:0;padding:14px 26px;border-radius:999px;font-size:15px;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;padding:6vw}
.card{border:1px solid ${PALETTE.line};border-radius:16px;padding:24px;background:#fff}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:${PALETTE.accent};margin-bottom:14px}
footer{text-align:center;color:${PALETTE.soft};padding:32px;font-size:13px}`
  return pageShell(title, body, style)
}

function renderApp(title: string, points: string[]): string {
  const rows = points
    .map((point) => `<li><span class="ic"></span><span>${escapeHtml(point)}</span></li>`)
    .join('\n')
  const body = `
<div class="phone"><div class="notch"></div>
<div class="screen">
<header class="app-top"><span>9:41</span><strong>${escapeHtml(title)}</strong></header>
<ul class="list">${rows || '<li><span class="ic"></span><span>Sua tela aparece aqui</span></li>'}</ul>
<nav class="tabbar"><span class="tab on"></span><span class="tab"></span><span class="tab"></span></nav>
</div></div>`
  const style = `
body{display:flex;justify-content:center;align-items:center;min-height:100vh;background:${PALETTE.line}}
.phone{width:320px;height:660px;background:#fff;border-radius:44px;box-shadow:0 30px 60px rgba(15,23,42,.25);position:relative;overflow:hidden;border:10px solid ${PALETTE.ink}}
.notch{position:absolute;top:0;left:50%;transform:translateX(-50%);width:140px;height:26px;background:${PALETTE.ink};border-radius:0 0 18px 18px;z-index:2}
.screen{display:flex;flex-direction:column;height:100%}
.app-top{padding:38px 22px 16px;display:flex;flex-direction:column;gap:6px;background:${PALETTE.accentSoft}}
.app-top strong{font-size:22px}
.list{list-style:none;flex:1;padding:8px 0;overflow:auto}
.list li{display:flex;gap:12px;align-items:center;padding:16px 22px;border-bottom:1px solid ${PALETTE.line};font-size:15px}
.ic{width:34px;height:34px;border-radius:10px;background:${PALETTE.accent};flex:none}
.tabbar{display:flex;justify-content:space-around;padding:16px;border-top:1px solid ${PALETTE.line}}
.tab{width:26px;height:26px;border-radius:8px;background:${PALETTE.line}}
.tab.on{background:${PALETTE.accent}}`
  return pageShell(title, body, style)
}

function renderWireframe(title: string, points: string[]): string {
  const blocks = (points.length ? points : ['bloco', 'bloco'])
    .map(() => '<div class="wblock"><div class="wline w60"></div><div class="wline w90"></div><div class="wline w40"></div></div>')
    .join('\n')
  const body = `
<div class="frame">
<div class="wbar"><div class="wlogo"></div><div class="wnav"></div></div>
<div class="whero"><div class="wline w50 lg"></div><div class="wline w80"></div><div class="wbtn"></div></div>
<div class="wgrid">${blocks}</div>
</div>`
  const style = `
body{background:#fff;padding:32px;filter:grayscale(1)}
.frame{max-width:960px;margin:0 auto;border:2px dashed #94a3b8;border-radius:12px;padding:24px}
.wbar{display:flex;justify-content:space-between;margin-bottom:24px}
.wlogo{width:120px;height:28px;background:#cbd5e1;border-radius:6px}
.wnav{width:220px;height:28px;background:#e2e8f0;border-radius:6px}
.whero{background:#f1f5f9;border-radius:10px;padding:40px;margin-bottom:24px}
.wline{height:16px;background:#cbd5e1;border-radius:6px;margin:10px 0}
.wline.lg{height:34px}
.w40{width:40%}.w50{width:50%}.w60{width:60%}.w80{width:80%}.w90{width:90%}
.wbtn{width:150px;height:40px;background:#94a3b8;border-radius:8px;margin-top:16px}
.wgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.wblock{border:1px solid #cbd5e1;border-radius:10px;padding:18px}
/* ${escapeHtml(title)} */`
  return pageShell(title, body, style)
}

function renderDocument(title: string, points: string[]): string {
  const paragraphs = (points.length ? points : ['Conteúdo do documento gerado a partir do briefing.'])
    .map((point) => `<h3>${escapeHtml(point)}</h3><p>${escapeHtml(point)}. Seção detalhada gerada a partir do briefing informado.</p>`)
    .join('\n')
  const body = `
<article class="doc">
<h1>${escapeHtml(title)}</h1>
<p class="meta">Documento · ${new Date().toLocaleDateString('pt-BR')}</p>
${paragraphs}
</article>`
  const style = `
body{background:${PALETTE.line}}
.doc{max-width:720px;margin:40px auto;background:#fff;padding:64px;border-radius:8px;box-shadow:0 20px 50px rgba(15,23,42,.12)}
h1{font-size:32px;margin-bottom:8px}
.meta{color:${PALETTE.soft};font-size:13px;margin-bottom:32px}
h3{margin:24px 0 8px;font-size:18px;color:${PALETTE.accent}}
p{color:${PALETTE.ink};margin-bottom:12px}`
  return pageShell(title, body, style)
}

function renderAnimation(title: string): string {
  const body = `
<div class="stage">
<div class="orb"></div>
<h1>${escapeHtml(title)}</h1>
</div>`
  const style = `
body{background:${PALETTE.ink};color:#fff}
.stage{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:32px;overflow:hidden}
.orb{width:140px;height:140px;border-radius:50%;background:linear-gradient(135deg,${PALETTE.accent},${PALETTE.accentSoft});animation:float 3s ease-in-out infinite,pulse 2s ease-in-out infinite}
h1{font-size:34px;animation:fade 2.5s ease forwards}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-28px)}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(15,118,110,.5)}50%{box-shadow:0 0 0 40px rgba(15,118,110,0)}}
@keyframes fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`
  return pageShell(title, body, style)
}

/**
 * Builds a self-contained HTML document previewing the requested artifact.
 * The output is safe to render inside a sandboxed iframe (`srcDoc`) and to
 * export as a `.html` file.
 */
export function buildDesignPreview(brief: string, kind: DesignArtifactKind): string {
  const title = deriveTitle(brief)
  const points = derivePoints(brief)
  switch (kind) {
    case 'slides':
      return renderSlides(title, points)
    case 'site':
      return renderSite(title, points)
    case 'app':
      return renderApp(title, points)
    case 'wireframe':
      return renderWireframe(title, points)
    case 'document':
      return renderDocument(title, points)
    case 'animation':
      return renderAnimation(title)
    default:
      return renderSite(title, points)
  }
}

/** Suggested export file name for a generated artifact. */
export function designExportFileName(brief: string, kind: DesignArtifactKind): string {
  const slug = deriveTitle(brief)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'design'
  return `${slug}-${kind}.html`
}
