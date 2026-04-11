# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (main) | ✅ |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability, please report it privately:

1. Go to the [Security tab](https://github.com/fsalamoni/Lexio/security/advisories/new) and open a **private advisory**
2. Or email the maintainer directly (see GitHub profile)

We will acknowledge receipt within 48 hours and provide a fix timeline.

## Security Best Practices for Self-Hosting

Before deploying Lexio in production:

1. **Copy `.env.example` to `.env`** and fill in all values — never use the placeholder values
2. **Generate strong secrets**:
   ```bash
   openssl rand -hex 32   # for JWT_SECRET and SECRET_KEY
   openssl rand -hex 24   # for POSTGRES_PASSWORD and QDRANT_API_KEY
   ```
3. **Never commit `.env`** — it is listed in `.gitignore`
4. **Set CORS_ORIGINS** to your actual domain(s) only
5. **Keep dependencies updated** — run `pip install -r requirements.txt --upgrade` periodically
6. **Use HTTPS** in production (reverse proxy: nginx/Caddy)
7. **Restrict network access** — only expose ports 80/443 publicly; keep database ports internal

## Frontend-Only Production Notes

- Lexio roda com chamadas LLM no browser. Em produção, prefira chaves por usuário salvas em `/users/{uid}/settings/preferences` e evite depender de fallbacks globais em runtime.
- Integrações de terceiros sujeitas a CORS devem passar por proxy controlado quando necessário; evite fallback direto do browser para endpoints que não oferecem política CORS estável.
- Novos módulos devem respeitar fronteiras de camada para reduzir blast radius: lógica de negócio em módulos reutilizáveis, UI apenas como consumidora.

## Secrets Management

All secrets must be provided via environment variables. The following are **required** in production:

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `QDRANT_API_KEY` | Qdrant vector database key |
| `JWT_SECRET` | JWT signing key (min 32 chars) |
| `SECRET_KEY` | Application secret key (min 32 chars) |
| `OPENROUTER_API_KEY` | LLM API key |
| `FIREBASE_API_KEY` | Firebase (if using Firebase mode) |
