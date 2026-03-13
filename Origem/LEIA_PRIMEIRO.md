# Como usar este pacote com o Claude Code

## Arquivos neste pacote

| Arquivo | O que é | Para que serve |
|---------|---------|----------------|
| `CLAUDE_CODE_PROMPT.md` | Prompt master (38KB) | **Entregar ao Claude Code como contexto principal** |
| `APP_PY_V23_REFERENCE.py` | docx-service v2.3 validado | Referência para migrar geração DOCX |
| `N8N_WORKFLOW_REFERENCE.json` | Workflow n8n completo (45 nós) | Referência — lógica original dos agentes |

---

## Passo a passo

### 1. Preparar o ambiente

Crie uma pasta para o projeto:
```powershell
mkdir C:\Projetos\openclaw
cd C:\Projetos\openclaw
git init
```

### 2. Abrir no Claude Code

```powershell
claude
```

### 3. Dar o contexto ao Claude Code

Na primeira mensagem, cole EXATAMENTE isto:

---

```
Leia o arquivo CLAUDE_CODE_PROMPT.md que está neste diretório.
Ele contém a especificação COMPLETA do projeto OpenClaw — uma plataforma
de geração de pareceres jurídicos com IA multi-agente para o MPRS.

Também estão aqui dois arquivos de referência:
- APP_PY_V23_REFERENCE.py → código atual do gerador DOCX (migrar para módulo)
- N8N_WORKFLOW_REFERENCE.json → workflow n8n original (toda lógica dos agentes)

Construa o projeto COMPLETO seguindo a ordem da Seção 16 do prompt.
Comece criando a estrutura de diretórios e o backend.
```

---

### 4. Copie os 3 arquivos para a pasta do projeto

ANTES de abrir o Claude Code, copie os arquivos:
```powershell
Copy-Item "$env:USERPROFILE\Downloads\CLAUDE_CODE_PROMPT.md" -Destination "C:\Projetos\openclaw\"
Copy-Item "$env:USERPROFILE\Downloads\APP_PY_V23_REFERENCE.py" -Destination "C:\Projetos\openclaw\"
Copy-Item "$env:USERPROFILE\Downloads\N8N_WORKFLOW_REFERENCE.json" -Destination "C:\Projetos\openclaw\"
```

### 5. Acompanhe e aprove

O Claude Code vai construir arquivo por arquivo. Ele pode pedir confirmação antes de criar cada bloco. Aprove e acompanhe.

Se ele parar no meio (limite de contexto), basta dizer:
```
Continue de onde parou. Consulte CLAUDE_CODE_PROMPT.md para referência.
```

### 6. Teste

Quando terminar:
```powershell
cd C:\Projetos\openclaw
docker compose up -d
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs (Swagger)
- Health check: http://localhost:8000/api/health

---

## Notas importantes

- O prompt foi construído para ser **auto-contido**. Claude Code NÃO precisa de informação adicional.
- Os prompts dos 9 agentes estão EXATOS — validados a score 95/100. O Claude Code não deve alterá-los.
- O arquivo de referência do n8n contém toda a lógica original caso precise consultar detalhes.
- Se o Claude Code sugerir Next.js em vez de React+Vite, corrija: o projeto usa React puro com Vite.
- Se o Claude Code sugerir autenticação complexa, diga para pular — será adicionada depois para SaaS.
