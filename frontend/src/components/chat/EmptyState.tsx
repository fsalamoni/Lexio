import { MessagesSquare, Sparkles } from 'lucide-react'

export default function EmptyState({ demo }: { demo?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-[var(--v2-border)] bg-white/60 px-8 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
        <MessagesSquare className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-[var(--v2-ink-strong)]">Comece uma conversa</h2>
        <p className="mt-1 max-w-md text-sm text-[var(--v2-ink-muted)]">
          O Orquestrador decide quais agentes chamar a cada iteração e mostra cada passo da trilha em tempo real.
          {demo
            ? ' Você está em modo demo — as respostas são geradas localmente, sem chamar a OpenRouter.'
            : ' Para resultados reais, configure suas chaves em /settings.'}
        </p>
      </div>
      <ul className="grid w-full max-w-lg grid-cols-1 gap-2 text-left text-xs text-[var(--v2-ink-muted)] sm:grid-cols-2">
        <ExampleHint text="Resuma o último parecer que comecei a redigir." />
        <ExampleHint text="Quais teses do meu banco se aplicam a este caso?" />
        <ExampleHint text="Pesquise 3 julgados recentes sobre licitação." />
        <ExampleHint text="Esboce a estrutura de uma petição inicial trabalhista." />
      </ul>
    </div>
  )
}

function ExampleHint({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-[var(--v2-border)] bg-white/80 p-3">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
      <span>{text}</span>
    </li>
  )
}
