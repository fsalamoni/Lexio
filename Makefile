.PHONY: up down logs ps health \
        test test-build test-unit test-api test-live \
        backup backup-restore \
        lint format

# ── Docker Compose ─────────────────────────────────────────────────────────────
up:
	docker compose up -d

down:
	docker compose down

ps:
	docker compose ps

logs:
	docker compose logs -f backend

health:
	curl -s http://localhost:8000/api/v1/health | python3 -m json.tool

# ── Tests ──────────────────────────────────────────────────────────────────────

## Build the test image (only needed first time or after dep changes)
test-build:
	docker build -f Dockerfile.test -t lexio-test .

## Run full test suite inside Docker (no running stack required)
test: test-build
	docker run --rm \
		-e OPENROUTER_API_KEY=sk-test \
		-e JWT_SECRET=test-secret-key-for-tests \
		-e DATABASE_URL=postgresql+asyncpg://lexio:lexio@localhost:5432/lexio \
		lexio-test

## Run only unit tests
test-unit: test-build
	docker run --rm \
		-e OPENROUTER_API_KEY=sk-test \
		-e JWT_SECRET=test-secret-key-for-tests \
		lexio-test python -m pytest tests/unit/ -v --tb=short

## Run only API validation tests
test-api: test-build
	docker run --rm \
		-e OPENROUTER_API_KEY=sk-test \
		-e JWT_SECRET=test-secret-key-for-tests \
		lexio-test python -m pytest tests/api/ -v --tb=short

## Run tests against running backend (requires `make up` first)
test-live:
	docker compose exec backend python -m pytest tests/ -v --tb=short

# ── Backup ─────────────────────────────────────────────────────────────────────

## Run a one-off backup (stores compressed dump in ./backups/)
backup:
	docker compose --profile backup run --rm backup

## Restore latest backup (pass FILE=backups/lexio_YYYYMMDD.sql.gz to override)
backup-restore:
	docker compose --profile backup run --rm \
		-e FILE=$(FILE) \
		--entrypoint /bin/sh \
		backup /scripts/restore.sh

## List available backups
backup-list:
	ls -lh backups/lexio_*.sql.gz 2>/dev/null || echo "No backups found."

# ── Code Quality ───────────────────────────────────────────────────────────────

## Lint with ruff
lint:
	ruff check packages/ tests/

## Format with black
format:
	black packages/ tests/
