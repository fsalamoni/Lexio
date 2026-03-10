-- Lexio — Database Schema
-- PostgreSQL 16 — Executed on first container startup

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations (multi-tenant root)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'free',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    title VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- Legal Areas (registry)
CREATE TABLE IF NOT EXISTS legal_areas (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    module_path VARCHAR(300) NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Types (registry)
CREATE TABLE IF NOT EXISTS document_types (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(500),
    category VARCHAR(100) DEFAULT 'general',
    module_path VARCHAR(300) NOT NULL,
    pipeline_config JSONB,
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents (main entity — generalized from Parecer)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_type_id VARCHAR(100) NOT NULL,
    legal_area_ids TEXT[] DEFAULT '{}',
    template_variant VARCHAR(100),
    original_request TEXT NOT NULL,
    tema VARCHAR(500),
    palavras_chave JSONB,
    area_direito VARCHAR(200),
    texto_completo TEXT,
    docx_path VARCHAR(500),
    quality_score INTEGER,
    quality_issues JSONB,
    status VARCHAR(50) DEFAULT 'processando',
    origem VARCHAR(50) DEFAULT 'web',
    metadata JSONB,
    author_id UUID REFERENCES users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type_id);

-- Executions (tracks each LLM agent call)
CREATE TABLE IF NOT EXISTS executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    agent_name VARCHAR(100) NOT NULL,
    phase VARCHAR(100) NOT NULL,
    model VARCHAR(200),
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost_usd DOUBLE PRECISION,
    duration_ms INTEGER,
    input_preview TEXT,
    output_preview TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_executions_doc ON executions(document_id);
CREATE INDEX IF NOT EXISTS idx_executions_org ON executions(organization_id);

-- Uploaded Documents (files for vector indexing)
CREATE TABLE IF NOT EXISTS uploaded_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(100),
    size_bytes INTEGER,
    chunks_indexed INTEGER DEFAULT 0,
    collection_name VARCHAR(200),
    status VARCHAR(50) DEFAULT 'pending',
    index_error VARCHAR(500),
    uploaded_by UUID REFERENCES users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_org ON uploaded_documents(organization_id);

-- User Profiles (anamnesis Layer 1)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    -- Professional profile
    institution VARCHAR(300),
    position VARCHAR(200),
    jurisdiction VARCHAR(200),
    experience_years INTEGER,
    primary_areas JSONB,
    specializations JSONB,

    -- Writing preferences
    formality_level VARCHAR(50),
    connective_style VARCHAR(50),
    citation_style VARCHAR(50),
    preferred_expressions JSONB,
    avoided_expressions JSONB,
    paragraph_length VARCHAR(50),

    -- Document preferences
    default_document_type VARCHAR(100),
    default_template VARCHAR(100),
    signature_block TEXT,
    header_text TEXT,

    -- AI preferences
    preferred_model VARCHAR(200),
    detail_level VARCHAR(50),
    argument_depth VARCHAR(50),
    include_opposing_view BOOLEAN DEFAULT TRUE,

    -- Metadata
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user ON user_profiles(user_id);

-- Theses (Thesis Bank)
CREATE TABLE IF NOT EXISTS theses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    -- Content
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,

    -- Classification
    legal_area_id VARCHAR(100) NOT NULL,
    document_type_id VARCHAR(100),
    tags TEXT[],
    category VARCHAR(100),

    -- Legal basis
    legal_basis JSONB,
    precedents JSONB,

    -- Metrics
    quality_score DOUBLE PRECISION,
    usage_count INTEGER DEFAULT 0,
    success_rate DOUBLE PRECISION,

    -- Source
    source_document_id UUID REFERENCES documents(id),
    source_type VARCHAR(50) DEFAULT 'auto_extracted',
    author_id UUID REFERENCES users(id),

    -- Status
    status VARCHAR(50) DEFAULT 'active',

    -- Metadata
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_theses_org ON theses(organization_id);
CREATE INDEX IF NOT EXISTS idx_theses_area ON theses(legal_area_id);
CREATE INDEX IF NOT EXISTS idx_theses_status ON theses(status);
CREATE INDEX IF NOT EXISTS idx_theses_doc_type ON theses(document_type_id);

-- Default organization
INSERT INTO organizations (name, slug, plan)
VALUES ('Lexio Demo', 'lexio-demo', 'free')
ON CONFLICT (slug) DO NOTHING;

-- ── WhatsApp Sessions (Fase 4) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    -- Contact info
    phone VARCHAR(100) NOT NULL,
    contact_name VARCHAR(200),

    -- Conversation state machine
    state VARCHAR(50) NOT NULL DEFAULT 'welcome',
    -- welcome | awaiting_doc_type | awaiting_content | processing | complete | error

    -- Collected inputs
    selected_doc_type VARCHAR(100),
    selected_legal_area VARCHAR(100),
    collected_content TEXT,

    -- Generated document
    document_id UUID REFERENCES documents(id),

    -- Extra turn context
    context JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_org ON whatsapp_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON whatsapp_sessions(phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_sessions_org_phone ON whatsapp_sessions(organization_id, phone);

-- ── Platform Settings (Admin API Keys) ──────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description VARCHAR(500),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
