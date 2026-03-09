.PHONY: up down logs test test-build test-unit test-api lint format

# ── Docker Compose ─────────────────────────────────────────────────────────────
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f backend

# ── Tests ──────────────────────────────────────────────────────────────────────

## Build the test image (only needed first time or after dep changes)
test-build:
	docker build -f Dockerfile.test -t lexio-test .

## Run full test suite (builds image if needed)
test: test-build
	docker run --rm \
		-e OPENROUTER_API_KEY=sk-test \
		-e JWT_SECRET=test-secret-key-for-tests \
		-e DATABASE_URL=sqlite+aiosqlite:///test.db \
		lexio-test

## Run only unit tests (no API tests)
test-unit: test-build
	docker run --rm \
		-e OPENROUTER_API_KEY=sk-test \
		-e JWT_SECRET=test-secret-key-for-tests \
		-e DATABASE_URL=sqlite+aiosqlite:///test.db \
		lexio-test \
		python -m pytest tests/unit/ -v --tb=short

## Run only API validation tests
test-api: test-build
	docker run --rm \
		-e OPENROUTER_API_KEY=sk-test \
		-e JWT_SECRET=test-secret-key-for-tests \
		-e DATABASE_URL=sqlite+aiosqlite:///test.db \
		lexio-test \
		python -m pytest tests/api/ -v --tb=short

## Run tests against running backend (requires `make up` first)
test-live:
	docker compose exec backend python -m pytest tests/ -v --tb=short

# ── Code Quality ───────────────────────────────────────────────────────────────

## Lint with ruff
lint:
	ruff check packages/ tests/

## Format with black
format:
	black packages/ tests/
