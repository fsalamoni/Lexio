# 📦 Base de Dados Qdrant — Acervo Jurídico

## Status: ✅ INTEGRADO

A base de dados Qdrant já está integrada no repositório na pasta `Teses/`.

### Coleções disponíveis

| Coleção | Descrição |
|---------|-----------|
| `acervo_juridico` | Acervo jurídico geral — teses, jurisprudência e fundamentação legal para todas as áreas do direito |
| `memoria_pessoal` | Memória pessoal — documentos produzidos pelo usuário, automaticamente indexados para servir de base em trabalhos futuros |

### Como funciona

O `docker-compose.yml` monta a pasta `./Teses` diretamente como storage do Qdrant:

```yaml
qdrant:
  volumes:
    - ./Teses:/qdrant/storage
```

Para iniciar:

```bash
docker compose up qdrant
```

### Configuração

As coleções são configuradas via variáveis de ambiente (`.env`):

```bash
QDRANT_COLLECTION=acervo_juridico              # Coleção padrão para busca e indexação
QDRANT_COLLECTIONS=acervo_juridico,memoria_pessoal  # Todas as coleções pesquisadas
```

Cada tipo de documento (`peticao_inicial`, `mandado_seguranca`, etc.) pesquisa
automaticamente em **ambas** as coleções durante a fase de pesquisa do pipeline.

### Fluxo de busca e indexação

```
Pipeline → Triagem (extrai tema)
         → Embedding (gera vetor)
         → Qdrant: busca em acervo_juridico
         → Qdrant: busca em memoria_pessoal
         → DataJud: jurisprudência CNJ
         → SearXNG: legislação web
         → Banco de Teses: teses reutilizáveis
         → Agentes LLM processam fragmentos
         → Documento gerado
         → Auto-indexação em memoria_pessoal (documento produzido vira referência futura)
```

### Memória Pessoal (Auto-indexação)

Quando um documento é concluído com sucesso pelo pipeline, seu texto completo é
automaticamente indexado na coleção `memoria_pessoal`. Isso significa que:

- Cada documento que o usuário produz se torna base para futuros trabalhos
- Pesquisas futuras encontram trechos relevantes de trabalhos anteriores
- A base de conhecimento pessoal cresce organicamente com o uso

### Git LFS

Os arquivos binários são rastreados via Git LFS. Após clonar o repositório:

```bash
git lfs install
git lfs pull
```

### Migração de nomes

Se você já tem dados com o nome `acervo_mprs`, basta renomear a pasta dentro de
`Teses/collections/acervo_mprs` para `Teses/collections/acervo_juridico` e reiniciar
o Qdrant. Ou altere a variável `QDRANT_COLLECTION=acervo_mprs` no `.env` para manter
o nome antigo.

### Limites do GitHub LFS (conta gratuita)

| Recurso | Limite |
|---------|--------|
| Armazenamento | 1 GB |
| Largura de banda/mês | 1 GB |

A base tem ~761 MB — cabe no limite gratuito.
