# Lexio — Plano de Implementação (Cache de Contexto)
## Atualizado: 2026-03-09

### Estado Atual (Concluído)
- ✅ Toast system (Toast.tsx) — useToast() hook, auto-dismiss, slide-in
- ✅ ErrorBoundary (ErrorBoundary.tsx)
- ✅ Skeleton loaders (Skeleton.tsx) — SkeletonRow/Card/Item
- ✅ Sidebar mobile-responsive (open/onClose + hamburger em Layout.tsx)
- ✅ StatusBadge com icons (Loader2 spinning / CheckCircle / XCircle)
- ✅ ProgressTracker com phase steps + gradient bar
- ✅ alert() → toast.error() em NewDocument, DocumentEditor, Onboarding
- ✅ beforeunload guard em DocumentEditor
- ✅ Password toggle (Eye/EyeOff) em Login e Register
- ✅ ToastProvider em App.tsx
- ✅ Dashboard com Recharts (BarChart + AreaChart), skeletons, agent table
- ✅ DocumentDetail com execution timeline, DOCX preview via mammoth
- ✅ DocumentList com paginação, status filter, quality score colors
- ✅ Upload com file history + polling de status
- ✅ Backend: asyncio import fix, async_session, TokenResponse.full_name
- ✅ Backend: DocumentDetailResponse com texto_completo
- ✅ Backend: /documents/{id}/executions endpoint
- ✅ Backend: stats routes (/, /daily, /agents, /recent)
- ✅ Backend: indexer.py (PDF/DOCX/TXT → chunks → Qdrant)
- ✅ Demo data: DEMO_STATS_DAILY/AGENTS/RECENT/EXECUTIONS

### Stack de Referência
- Frontend: React 18 + TS + Vite + Tailwind + clsx + lucide-react + recharts + mammoth
- Deps: @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @tiptap/*, date-fns, firebase, axios
- Brand colors: 50..900 (50=#f0f4ff, 600=#2d41e2, 900=#1a2259)
- Backend: FastAPI + SQLAlchemy async + PostgreSQL + Qdrant + Ollama + OpenRouter

### Próximos Passos (Prioridade Alta)
1. **CSS/Tailwind**: slide-in toast animation, Inter font, @layer utilities
2. **ThesisBank**: debounce search, skeleton, toast errors, copy button
3. **DocumentList**: overflow-x-auto mobile, skeleton loading
4. **NewDocument**: skeleton while loading doc types, character count no textarea
5. **DocumentEditor**: polling stop when saved=true, word count
6. **AdminPanel**: implementar UI completa (está vazia/placeholder?)
7. **Backend**: verificar AdminPanel routes + WebSocket WS_URL fix
8. **RichTextEditor**: verificar estado atual

### Próximos Passos (Média Prioridade)
9. **404 Page**: criar página NotFound
10. **Sidebar**: active route highlighting mais nítido
11. **DocumentDetail**: stop polling quando concluido (verificar se já funciona)
12. **Login**: "Forgot password" link
13. **Auth contexts**: verificar se fullName é propagado corretamente

### Arquitetura de Arquivos Key
```
frontend/src/
  components/
    ErrorBoundary.tsx ✅  Layout.tsx ✅  ProgressTracker.tsx ✅
    RichTextEditor.tsx    Sidebar.tsx ✅  Skeleton.tsx ✅
    StatusBadge.tsx ✅   Toast.tsx ✅
  pages/
    Dashboard.tsx ✅     DocumentDetail.tsx ✅  DocumentEditor.tsx ✅
    DocumentList.tsx ✅  NewDocument.tsx ✅     Onboarding.tsx ✅
    ThesisBank.tsx       Upload.tsx ✅          AdminPanel.tsx (?)
    auth/Login.tsx ✅    auth/Register.tsx ✅
  contexts/AuthContext.tsx
  api/client.ts
  demo/data.ts ✅        demo/interceptor.ts ✅
packages/api/routes/
  auth.py ✅  documents.py ✅  stats.py ✅  uploads.py ✅
  admin.py    anamnesis.py    document_types.py  health.py
  legal_areas.py  thesis_bank.py  webhooks.py
```

### Bugs Conhecidos / Pendências Backend
- ProgressTracker: WS URL quando deploy HTTPS (wss://)
- DocumentDetail: polling não para ao status=concluido (verificar)
- Dashboard: silent .catch(() => {}) → toast
- ThesisBank: silent .catch(() => {})

### Demo Data Disponível
DEMO_STATS_DAILY, DEMO_STATS_AGENTS, DEMO_STATS_RECENT, DEMO_EXECUTIONS
Interceptor routes: /stats, /stats/daily, /stats/agents, /stats/recent
/documents/:id/executions, /documents, /documents/:id, /theses, /theses/stats
