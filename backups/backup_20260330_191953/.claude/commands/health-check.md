# /health-check — Verificar saúde do sistema

Verifique a saúde completa do Lexio.

## Comandos
```bash
# Health geral
curl -s localhost:8000/api/v1/health | python -m json.tool

# Health dos módulos (requer auth admin)
curl -s -H "Authorization: Bearer $TOKEN" localhost:8000/api/v1/admin/modules/health | python -m json.tool

# Verificar containers
docker compose ps

# Logs de erro
docker compose logs --tail=50 backend 2>&1 | grep -i error
```

## Serviços verificados
- PostgreSQL (porta 5432)
- Qdrant (porta 6333)
- Ollama (porta 11434)
- SearXNG (porta 8888)
- Backend (porta 8000)
- Frontend (porta 3000)
