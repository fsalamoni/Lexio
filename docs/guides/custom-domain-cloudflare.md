# Migrar o Lexio para um domínio próprio (Cloudflare DNS + Firebase Hosting)

> Objetivo: servir o Lexio em `protagonistarpg.com.br` **sem afetar nada** das outras
> plataformas que já rodam nesse domínio (funcionalidades, ferramentas, banco de dados, e‑mail).

## TL;DR da decisão

| Opção | Viável? | Risco para o resto do domínio |
|-------|---------|-------------------------------|
| **`lexio.protagonistarpg.com.br`** (subdomínio) | ✅ Recomendado | **Zero** — é um registro DNS novo e isolado |
| `protagonistarpg.com.br/lexio` (subpath) | ⚠️ Desaconselhado | **Alto** — exige reverse‑proxy (Cloudflare Worker) no apex que já serve outra plataforma |

**DNS roteia por host, não por caminho.** Não existe registro para "`/lexio`". Para servir um app
sob um *path* do apex seria preciso um Worker reescrevendo `/lexio/*` para o Firebase — mexendo
justamente na configuração do apex que hoje serve outra plataforma. Logo: **subdomínio**.

## O que NÃO muda (garantia de isolamento)

- **Outras plataformas / registros DNS:** nada é alterado. Só **adicionamos** um registro `lexio`.
  Status de proxy (laranja/cinza), MX, SPF, apex, `www` etc. ficam exatamente como estão.
- **Banco de dados (Firestore):** não tem relação com DNS. Intocado.
- **`lexio.web.app`:** continua funcionando em paralelo (o site do Firebase aceita os dois domínios).
- **Login (Firebase Auth):** o `authDomain` permanece `hocapp-44760.firebaseapp.com` — só
  precisamos **adicionar** (não remover) o novo domínio à lista de autorizados.
- **Reversível:** remover o registro `lexio` no Cloudflare reverte tudo; nada mais é afetado.

## Lado do código (repositório) — já está pronto

- Build do Firebase usa `VITE_BASE_PATH=/` → servido na raiz do subdomínio.
- Referers de OpenRouter usam `window.location.origin` em runtime (o `https://lexio.web.app`
  hardcoded é só fallback de SSR/teste).
- DataJud chama a Cloud Function pública (`…cloudfunctions.net/datajudProxy`) a partir de
  qualquer host; o rewrite `/api/datajud` também vale para o domínio custom no mesmo site.

Nenhuma alteração de código é necessária para o subdomínio funcionar.

## Runbook (passos no console — exigem a conta do dono)

### 1) Firebase Console → adicionar domínio custom
`Hosting` → site **`lexio`** → **Add custom domain** → `lexio.protagonistarpg.com.br`.
O assistente mostra os registros a criar: normalmente **1 TXT** (verificação de posse) e depois
**2 registros A** (dois IPv4 do Firebase). Copie os **valores exatos exibidos**.

### 2) Cloudflare → adicionar SOMENTE o subdomínio `lexio`
Em `DNS` da zona `protagonistarpg.com.br`, **adicione** (sem editar nada existente):
- O **TXT** de verificação (Name: `lexio` ou conforme o assistente; Content: valor do Firebase).
- Os **2 registros A** (Name: `lexio`; IPv4 = os do Firebase).
- **Proxy status: "DNS only" (nuvem cinza)** nesses registros A durante a configuração —
  o proxy laranja atrapalha a emissão do certificado SSL gerenciado do Firebase.
  (Cada registro tem seu próprio status; isso não muda o proxy dos demais.)

Volte ao Firebase e aguarde **"Connected"** + SSL provisionado (de minutos a ~24h).
*(Opcional, depois de ativo: pode trocar para proxy laranja com SSL/TLS = "Full (strict)".)*

### 3) Firebase Console → Authentication → autorizar o domínio
`Authentication` → `Settings` → **Authorized domains** → **Add domain** →
`lexio.protagonistarpg.com.br`. (Sem isso, login/OAuth falham no novo domínio.)

### 4) Google Cloud Console → OAuth Client ID (conector Drive/Gmail)
`APIs & Services` → `Credenciais` → seu **OAuth Client ID** → **Origens JavaScript autorizadas**
→ **adicione** `https://lexio.protagonistarpg.com.br` (mantenha as origens já existentes).

## Verificação

1. `https://lexio.protagonistarpg.com.br` abre o app com cadeado válido (HTTPS).
2. Login Google/e‑mail funciona.
3. Geração de documento, DataJud (jurisprudência), TTS e imagens funcionam.
4. `https://lexio.web.app` continua funcionando (nada foi removido).

## Rollback

Remover os registros `lexio` no Cloudflare e o domínio custom no Firebase. Nenhum outro
registro/zona/plataforma é tocado no processo.
