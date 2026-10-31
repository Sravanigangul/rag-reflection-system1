CREATE TABLE IF NOT EXISTS rag_execution_traces (
    trace_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    retrieval_query_changed INTEGER NOT NULL DEFAULT 0,
    retrieval_retried INTEGER NOT NULL DEFAULT 0,
    retrieved_chunk_ids TEXT,
    retrieval_assessment TEXT,
    reflection_supported INTEGER,
    reflection_issues TEXT,
    citation_count INTEGER NOT NULL DEFAULT 0,
    model_name TEXT,
    error_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_rag_traces_created_at
ON rag_execution_traces(created_at);

CREATE INDEX IF NOT EXISTS idx_rag_traces_status
ON rag_execution_traces(status);
