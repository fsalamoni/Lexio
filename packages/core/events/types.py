"""Lexio Core — Event type constants."""


class EventType:
    # Document lifecycle
    DOCUMENT_CREATED = "document.created"
    DOCUMENT_PROCESSING = "document.processing"
    DOCUMENT_COMPLETED = "document.completed"
    DOCUMENT_FAILED = "document.failed"
    DOCUMENT_EDITED = "document.edited"

    # Pipeline
    PIPELINE_STARTED = "pipeline.started"
    PIPELINE_PHASE_CHANGED = "pipeline.phase_changed"
    PIPELINE_COMPLETED = "pipeline.completed"
    PIPELINE_FAILED = "pipeline.failed"

    # Module
    MODULE_LOADED = "module.loaded"
    MODULE_FAILED = "module.failed"
    MODULE_HEALTH_CHECK = "module.health_check"

    # Upload
    UPLOAD_STARTED = "upload.started"
    UPLOAD_INDEXED = "upload.indexed"
    UPLOAD_FAILED = "upload.failed"

    # Auth
    USER_REGISTERED = "user.registered"
    USER_LOGGED_IN = "user.logged_in"
