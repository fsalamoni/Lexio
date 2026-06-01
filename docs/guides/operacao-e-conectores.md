# Guia operacional — o que VOCÊ precisa fazer (e onde)

> Passo a passo para ativar e usar tudo que foi entregue no Chat Orquestrador.
> Tudo está atrás de flags **desligadas** — nada muda até você ligar.

---

## 1. Ligar as funcionalidades (flags) — no app

**Onde:** `/settings` (Configurações) → seção **"Recursos beta do Chat"**.

Cada toggle vale **só para a sua conta** (persiste em `settings/preferences.feature_flags`).
Ligue na ordem sugerida e valide cada uma:

| Flag | O que ativa | Pré-requisito |
|------|-------------|---------------|
| `FF_CHAT_CONVO_TOOLS` | Exportar conversa, busca, fixar | nenhum |
| `FF_CHAT_ENGINE_PLUS` | Teto de custo USD, crítico melhor, memória, prompt caching | nenhum |
| `FF_CHAT_PC_APPROVALS` | Aprovação + auditoria + status do sidecar; apagar/renomear | sidecar rodando |
| `FF_CHAT_PC_GIT` | git status/diff/commit/pull/push | sidecar + repo git |
| `FF_CHAT_GITHUB` | Conector GitHub (issues/PRs/leitura) + git autenticado | PAT do GitHub |
| `FF_CHAT_GOOGLE` | Conectores Google Drive + Gmail | OAuth Client ID do Google |

**Para todos os usuários (opcional):** em vez de ligar por conta, defina as variáveis no
build/deploy (`VITE_FF_CHAT_PC_APPROVALS=true`, etc.) nos workflows
`.github/workflows/deploy-pages.yml` e `firebase-deploy.yml`.

---

## 2. Rodar o sidecar `@lexio/desktop` — no SEU computador

Necessário para as ações de **arquivos/shell/git locais** (Ondas 1 e 2).

**Onde:** terminal do seu PC.

```bash
# pasta de trabalho = sandbox; permissões mínimas necessárias
npx @lexio/desktop --root "/caminho/da/pasta" --permissions read,write,execute,delete,rename
```

> Enquanto o pacote não estiver publicado no npm (ver passo 6), rode a partir do
> repositório: `node packages/desktop/bin/lexio-desktop.mjs --root ... --permissions ...`

O processo imprime um **token de pareamento** e a pasta. **Onde colar:** `/settings` →
**"Pasta local (PC)"** → cole o token → **"Testar conexão"** (deve mostrar a pasta e as
permissões). Escolha a **Política de aprovação**: *Por ação* (padrão) ou *Máxima cautela*
(pede aprovação até em leituras).

No chat, ao pedir uma ação que altera o PC, aparece um pedido de aprovação — responda
**aprovar / rejeitar / ajustar**. O histórico fica em **"Auditoria de ações no PC"**.

---

## 3. Conector GitHub (PAT) — no GitHub e no app

**Onde criar:** GitHub → *Settings → Developer settings → Personal access tokens →
Fine-grained tokens*.
- **Repository access:** só os repositórios desejados.
- **Permissions:** Contents (Read/Write), Issues (Read/Write), Pull requests (Read/Write).

**Onde colar:** `/settings` → **"Conector GitHub"** → cole o token → defina owner/repo
padrão (opcional) → **"Testar conexão"**. Com `FF_CHAT_PC_GIT` ligado e o sidecar rodando,
`git push`/`pull` em repositórios privados do GitHub passam a autenticar com esse token.

---

## 4. Conectores Google Drive + Gmail (OAuth) — no Google Cloud e no app

> Sem backend, o Google usa **OAuth client-side**. Você precisa de um **OAuth Client ID**
> (público) — não há segredo de cliente.

**Onde configurar (Google Cloud Console — console.cloud.google.com):**
1. Crie/abra um **projeto**.
2. **APIs e serviços → Biblioteca:** habilite **Google Drive API** e **Gmail API**.
3. **Tela de consentimento OAuth:** tipo *Externo*; adicione seu e-mail como **usuário de teste**
   (apps não verificados permitem até 100 usuários de teste — suficiente para uso próprio).
   Escopos: `drive.readonly`, `gmail.readonly`, `gmail.compose`.
4. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web.**
   - **Origens JavaScript autorizadas:** `https://lexio.protagonistarpg.com.br`
     (domínio próprio), `https://lexio.web.app`, `https://fsalamoni.github.io`,
     `http://localhost:3000`. Inclua **todas** as origens onde o app é servido.
   - Copie o **Client ID** (`...apps.googleusercontent.com`).

**Onde colar:** `/settings` → **"Conector Google"** → cole o **Client ID** → **"Conectar"**
(abre o consentimento Google e guarda um token de acesso na sessão). Pronto: no chat dá para
listar/ler arquivos do Drive e buscar/ler e-mails; criar rascunho no Gmail pede aprovação.

> ⚠️ Escopos do Gmail são "restritos" pelo Google: para uso além dos usuários de teste
> (publicação ampla), o Google exige verificação do app. Para uso próprio, mantenha-se como
> usuário de teste.

> 🔧 **"Falha ao carregar o Google Identity Services"** — o script da GIS é servido de
> `https://accounts.google.com/gsi/client` e precisa estar liberado na **CSP**. Já consta em
> `frontend/index.html` (GitHub Pages) e em `firebase.json` (`script-src`/`script-src-elem`,
> Firebase Hosting). Se você mantém uma CSP própria (proxy/CDN/domínio customizado), inclua
> `https://accounts.google.com` em `script-src` **e** `script-src-elem`. Outra causa comum é a
> **origem não autorizada**: confira as Origens JavaScript do Client ID (passo 4 acima).

> ℹ️ **Não confunda com a "verificação de branding" do Google.** Para conectar o **seu próprio**
> Drive/Gmail, basta ser **usuário de teste** — verificação NÃO é necessária. A verificação
> (página inicial pública sem login, nome do app, propriedade do domínio, política de
> privacidade) só é exigida para liberar o conector a **usuários externos** em produção.

> 🛡️ **Isolar o conector num projeto Google Cloud dedicado (recomendado se o projeto tem
> outros apps).** O status "Teste/Produção" da tela de consentimento é **do projeto inteiro** e
> vale para **todos** os OAuth clients dele — logo, pôr o projeto em "Teste" pode restringir
> outros apps que pedem escopos sensíveis (Drive/Gmail/Agenda). Apps que usam só "Entrar com
> Google" (nome/e‑mail/perfil) **não** são afetados. Para garantir zero impacto: crie um
> **projeto novo** só pro conector → habilite **Drive API + Gmail API** → tela de consentimento
> **Externo/Teste** + você como **usuário de teste** → crie um **OAuth Client ID (Web)** com a
> origem do seu domínio → cole esse Client ID em `/settings` → Conector Google. O Client ID é
> só de UI (salvo no Firestore do usuário), então **não há mudança de código nem deploy**. O
> login do próprio Lexio (Firebase Auth) continua no projeto original, intocado.

---

## 5. Validação E2E (depois de ligar as flags)

1. **Conversa/UX:** ligue `FF_CHAT_CONVO_TOOLS` → exporte uma conversa, fixe e busque na lista.
2. **PC:** sidecar rodando + `FF_CHAT_PC_APPROVALS` → peça "salve um arquivo X" → aprove →
   confira o arquivo e a auditoria; o badge do header fica verde.
3. **git:** `FF_CHAT_PC_GIT` num repo de teste → "qual o git status?", "faça commit".
4. **GitHub:** PAT salvo → "crie uma issue de teste no repo Y" → aprove → confira a URL.
5. **Google:** Client ID salvo + conectado → "liste meus arquivos recentes do Drive",
   "busque e-mails sobre X".

---

## 6. Publicar o `@lexio/desktop` (para `npx` funcionar) — npm

**Onde:** sua conta npm. Passos completos em `packages/desktop/PUBLISHING.md` (resumo:
escolher licença, ser dono do escopo `@lexio`, remover `private`, `npm publish --access public`).

---

## Resumo dos "locais"

| Ação | Local |
|------|-------|
| Ligar flags | App → `/settings` → Recursos beta do Chat |
| Parear sidecar | Seu PC (terminal) + App → `/settings` → Pasta local (PC) |
| Token GitHub | GitHub (PAT) + App → `/settings` → Conector GitHub |
| Client ID Google | Google Cloud Console + App → `/settings` → Conector Google |
| Publicar sidecar | npm (`packages/desktop/PUBLISHING.md`) |
| Ver custos | App → `/settings/costs` e `/admin/costs` |
| Ver auditoria | App → chat (por conversa) e `/settings` → Auditoria de ações no PC |
