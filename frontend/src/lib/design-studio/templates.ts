/**
 * Design Studio — deterministic, client-side scaffold generation.
 *
 * Turns a text brief (or a fully-specified DesignSpec) plus an artifact kind and
 * a theme into a self-contained HTML document that can be previewed in a
 * sandboxed iframe and exported.
 *
 * The generation here is intentionally deterministic and offline (no LLM / no
 * network) so the studio has a safe, zero-cost baseline. Higher phases layer an
 * LLM design agent, template import/export, design cloning from URLs and
 * repository binding on top of this same preview/export contract.
 */

import {
  DEFAULT_DESIGN_THEME_ID,
  resolvePalette,
  type DesignPalette,
  type DesignThemeId,
} from './themes'

export type DesignArtifactKind =
  | 'slides'
  | 'site'
  | 'app'
  | 'wireframe'
  | 'document'
  | 'animation'
  | 'code'

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
  { kind: 'code', label: 'Código + design', description: 'Plano de desenvolvimento com arquitetura, UX e entregáveis.' },
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

function pageShell(title: string, body: string, style: string, p: DesignPalette): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:${p.ink};background:${p.canvas};line-height:1.5}
${style}
</style>
</head>
<body>
${body}
</body>
</html>`
}

function renderSlides(title: string, points: string[], p: DesignPalette): string {
  const slides = [
    `<section class="slide cover"><p class="eyebrow">Apresentação</p><h1>${escapeHtml(title)}</h1></section>`,
    ...points.map(
      (point, index) =>
        `<section class="slide"><p class="num">${String(index + 1).padStart(2, '0')}</p><h2>${escapeHtml(point)}</h2></section>`,
    ),
  ].join('\n')
  const style = `
.slide{min-height:56.25vw;max-height:70vh;display:flex;flex-direction:column;justify-content:center;padding:8vw;border-bottom:1px solid ${p.line}}
.cover{background:${p.ink};color:${p.canvas}}
.eyebrow{text-transform:uppercase;letter-spacing:.24em;font-size:12px;opacity:.7;margin-bottom:16px}
.num{color:${p.accent};font-weight:700;letter-spacing:.2em;margin-bottom:12px}
h1{font-size:44px;line-height:1.1}
h2{font-size:30px;color:${p.ink}}`
  return pageShell(title, slides, style, p)
}

function renderSite(title: string, points: string[], p: DesignPalette): string {
  const features = points
    .map((point) => `<article class="card"><span class="dot"></span><p>${escapeHtml(point)}</p></article>`)
    .join('\n')
  const body = `
<header class="nav"><strong>${escapeHtml(title)}</strong><nav><a>Recursos</a><a>Preços</a><a class="cta">Começar</a></nav></header>
<section class="hero"><h1>${escapeHtml(title)}</h1><p>Landing gerada a partir do seu briefing.</p><button class="cta-btn">Solicitar acesso</button></section>
<section class="grid">${features}</section>
<footer>© ${new Date().getFullYear()} · Gerado no Design Studio</footer>`
  const style = `
.nav{display:flex;align-items:center;justify-content:space-between;padding:20px 6vw;border-bottom:1px solid ${p.line}}
.nav nav{display:flex;gap:20px;align-items:center}
.nav a{color:${p.soft};text-decoration:none;font-size:14px}
.cta{color:${p.accent};font-weight:600}
.hero{text-align:center;padding:10vw 6vw;background:${p.accentSoft}}
.hero h1{font-size:46px;max-width:720px;margin:0 auto 16px}
.hero p{color:${p.soft};font-size:18px;margin-bottom:24px}
.cta-btn{background:${p.accent};color:${p.canvas};border:0;padding:14px 26px;border-radius:999px;font-size:15px;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;padding:6vw}
.card{border:1px solid ${p.line};border-radius:16px;padding:24px;background:${p.canvas}}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.accent};margin-bottom:14px}
footer{text-align:center;color:${p.soft};padding:32px;font-size:13px}`
  return pageShell(title, body, style, p)
}

function renderApp(title: string, points: string[], p: DesignPalette): string {
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
body{display:flex;justify-content:center;align-items:center;min-height:100vh;background:${p.line}}
.phone{width:320px;height:660px;background:${p.canvas};border-radius:44px;box-shadow:0 30px 60px rgba(15,23,42,.25);position:relative;overflow:hidden;border:10px solid ${p.ink}}
.notch{position:absolute;top:0;left:50%;transform:translateX(-50%);width:140px;height:26px;background:${p.ink};border-radius:0 0 18px 18px;z-index:2}
.screen{display:flex;flex-direction:column;height:100%}
.app-top{padding:38px 22px 16px;display:flex;flex-direction:column;gap:6px;background:${p.accentSoft}}
.app-top strong{font-size:22px}
.list{list-style:none;flex:1;padding:8px 0;overflow:auto}
.list li{display:flex;gap:12px;align-items:center;padding:16px 22px;border-bottom:1px solid ${p.line};font-size:15px}
.ic{width:34px;height:34px;border-radius:10px;background:${p.accent};flex:none}
.tabbar{display:flex;justify-content:space-around;padding:16px;border-top:1px solid ${p.line}}
.tab{width:26px;height:26px;border-radius:8px;background:${p.line}}
.tab.on{background:${p.accent}}`
  return pageShell(title, body, style, p)
}

function renderWireframe(title: string, points: string[], p: DesignPalette): string {
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
  return pageShell(title, body, style, p)
}

function renderDocument(title: string, points: string[], p: DesignPalette): string {
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
body{background:${p.line}}
.doc{max-width:720px;margin:40px auto;background:${p.canvas};padding:64px;border-radius:8px;box-shadow:0 20px 50px rgba(15,23,42,.12)}
h1{font-size:32px;margin-bottom:8px}
.meta{color:${p.soft};font-size:13px;margin-bottom:32px}
h3{margin:24px 0 8px;font-size:18px;color:${p.accent}}
p{color:${p.ink};margin-bottom:12px}`
  return pageShell(title, body, style, p)
}

function renderAnimation(title: string, p: DesignPalette): string {
  const body = `
<div class="stage">
<div class="orb"></div>
<h1>${escapeHtml(title)}</h1>
</div>`
  const style = `
body{background:${p.ink};color:${p.canvas}}
.stage{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:32px;overflow:hidden}
.orb{width:140px;height:140px;border-radius:50%;background:linear-gradient(135deg,${p.accent},${p.accentSoft});animation:float 3s ease-in-out infinite,pulse 2s ease-in-out infinite}
h1{font-size:34px;animation:fade 2.5s ease forwards}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-28px)}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(15,118,110,.5)}50%{box-shadow:0 0 0 40px rgba(15,118,110,0)}}
@keyframes fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`
  return pageShell(title, body, style, p)
}

function renderCode(title: string, points: string[], p: DesignPalette): string {
  const backlog = (points.length ? points : ['Definir escopo', 'Implementar interface', 'Validar entrega'])
    .map(
      (point, index) => `
<article class="task">
  <span>${String(index + 1).padStart(2, '0')}</span>
  <div><h3>${escapeHtml(point)}</h3><p>Design, código, testes e critérios de aceite encadeados para esta etapa.</p></div>
</article>`,
    )
    .join('\n')
  const body = `
<main class="workspace">
  <section class="hero">
    <p class="eyebrow">Desenvolvimento + Design</p>
    <h1>${escapeHtml(title)}</h1>
    <p>Orquestração de produto, UX, implementação, revisão e entrega em repositório.</p>
  </section>
  <section class="grid">
    <aside>
      <strong>Pipeline</strong>
      <ol><li>Brief opcional</li><li>Plano do orquestrador</li><li>Agentes especialistas</li><li>Aplicação no repo</li></ol>
    </aside>
    <div class="tasks">${backlog}</div>
  </section>
</main>`
  const style = `
.workspace{min-height:100vh;padding:6vw;background:linear-gradient(135deg,${p.canvas},${p.accentSoft})}
.hero{max-width:820px;margin-bottom:36px}
.eyebrow{text-transform:uppercase;letter-spacing:.22em;color:${p.accent};font-size:12px;font-weight:800;margin-bottom:12px}
h1{font-size:46px;line-height:1.05;margin-bottom:14px}
.hero p{color:${p.soft};font-size:18px}
.grid{display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:20px}
aside,.task{border:1px solid ${p.line};background:rgba(255,255,255,.82);border-radius:18px;padding:22px;box-shadow:0 18px 40px rgba(15,23,42,.08)}
ol{margin:14px 0 0 20px;color:${p.soft};font-size:14px}
.tasks{display:grid;gap:14px}
.task{display:flex;gap:18px;align-items:flex-start}
.task span{color:${p.accent};font-weight:800;letter-spacing:.12em}
.task h3{font-size:18px;margin-bottom:6px}
.task p{color:${p.soft};font-size:14px}
@media(max-width:760px){.grid{grid-template-columns:1fr}h1{font-size:34px}}`
  return pageShell(title, body, style, p)
}

/** Low-level renderer: builds HTML from an already-resolved title/points/palette. */
export function renderArtifact(
  kind: DesignArtifactKind,
  title: string,
  points: string[],
  palette: DesignPalette,
): string {
  switch (kind) {
    case 'slides':
      return renderSlides(title, points, palette)
    case 'site':
      return renderSite(title, points, palette)
    case 'app':
      return renderApp(title, points, palette)
    case 'wireframe':
      return renderWireframe(title, points, palette)
    case 'document':
      return renderDocument(title, points, palette)
    case 'animation':
      return renderAnimation(title, palette)
    case 'code':
      return renderCode(title, points, palette)
    default:
      return renderSite(title, points, palette)
  }
}

/**
 * Builds a self-contained HTML document previewing the requested artifact from a
 * free-text brief. The output is safe to render inside a sandboxed iframe
 * (`srcDoc`) and to export as a `.html` file.
 */
export function buildDesignPreview(
  brief: string,
  kind: DesignArtifactKind,
  themeId: DesignThemeId = DEFAULT_DESIGN_THEME_ID,
): string {
  const title = deriveTitle(brief)
  const points = derivePoints(brief)
  return renderArtifact(kind, title, points, resolvePalette(themeId))
}

/** Suggested export file name for a generated artifact. */
export function designExportFileName(
  brief: string,
  kind: DesignArtifactKind,
  extension = 'html',
): string {
  const slug = deriveTitle(brief)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'design'
  return `${slug}-${kind}.${extension}`
}
