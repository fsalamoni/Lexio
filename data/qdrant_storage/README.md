# Qdrant Vector Database Storage

> **Nota:** A base de dados principal está na pasta `Teses/` na raiz do repositório.
> O `docker-compose.yml` monta `./Teses:/qdrant/storage`.
>
> Este diretório pode ser usado como alternativa local para dados customizados.
> Para usar esta pasta em vez de `Teses/`, altere o volume no `docker-compose.yml`:
> ```yaml
> volumes:
>   - ./data/qdrant_storage:/qdrant/storage
> ```

## Coleções da base principal (`Teses/`)

| Coleção | Descrição |
|---------|-----------|
| `acervo_mprs` | Acervo jurídico do MPRS — teses, jurisprudência, fundamentação legal |
| `memoria_pessoal` | Memória pessoal — notas jurídicas e referências individuais |

## Git LFS

Arquivos binários são rastreados via **Git LFS**. Após clonar:

```bash
git lfs pull
```
