# 📦 Base de Dados Qdrant — Teses Jurídicas

## Status: ✅ INTEGRADO

A base de dados Qdrant já está integrada no repositório na pasta `Teses/`.

### Coleções disponíveis

| Coleção | Descrição |
|---------|-----------|
| `acervo_mprs` | Acervo jurídico do MPRS — teses, jurisprudência e fundamentação legal |
| `memoria_pessoal` | Memória pessoal — notas jurídicas e referências individuais |

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
QDRANT_COLLECTION=acervo_mprs              # Coleção padrão para busca
QDRANT_COLLECTIONS=acervo_mprs,memoria_pessoal  # Todas as coleções pesquisadas
```

Cada tipo de documento (`peticao_inicial`, `mandado_seguranca`, etc.) pesquisa
automaticamente em **ambas** as coleções durante a fase de pesquisa do pipeline.

### Fluxo de busca

```
Pipeline → Triagem (extrai tema)
         → Embedding (gera vetor)
         → Qdrant: busca em acervo_mprs
         → Qdrant: busca em memoria_pessoal
         → DataJud: jurisprudência CNJ
         → SearXNG: legislação web
         → Banco de Teses: teses reutilizáveis
         → Agentes LLM processam fragmentos
```

### Git LFS

Os arquivos binários são rastreados via Git LFS. Após clonar o repositório:

```bash
git lfs install
git lfs pull
```

### Limites do GitHub LFS (conta gratuita)

| Recurso | Limite |
|---------|--------|
| Armazenamento | 1 GB |
| Largura de banda/mês | 1 GB |

A base tem ~761 MB — cabe no limite gratuito.
