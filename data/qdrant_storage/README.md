# Qdrant Vector Database Storage

This directory contains the Qdrant vector database with pre-indexed legal documents for the Lexio platform.

## Structure

```
qdrant_storage/
├── collections/          # Vector collections (jurisprudencia, legislacao, etc.)
│   └── <collection>/
│       ├── segments/     # Data segments with vectors and payloads
│       └── config.json   # Collection configuration
├── aliases/              # Collection aliases
└── .lock                 # Lock file
```

## Usage

### With Docker Compose (recommended)

The `docker-compose.yml` is configured to mount this directory automatically:

```bash
docker compose up qdrant
```

### Manual Qdrant

Point your Qdrant instance to this directory:

```bash
docker run -p 6333:6333 -v ./data/qdrant_storage:/qdrant/storage qdrant/qdrant
```

## Git LFS

These files are tracked via **Git LFS** (Large File Storage) due to their size.
After cloning, run:

```bash
git lfs pull
```

## Size

~761 MB of pre-indexed legal vectors.
