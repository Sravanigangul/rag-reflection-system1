CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts
USING fts5(
    chunk_id UNINDEXED,
    document_id UNINDEXED,
    content,
    source UNINDEXED
);

-- Automatically add new chunks to the FTS search index.
CREATE TRIGGER IF NOT EXISTS document_chunks_fts_insert
AFTER INSERT ON document_chunks
BEGIN
    INSERT INTO document_chunks_fts (
        chunk_id,
        document_id,
        content,
        source
    )
    SELECT
        NEW.id,
        NEW.document_id,
        NEW.content,
        documents.source
    FROM documents
    WHERE documents.id = NEW.document_id;
END;

-- Automatically remove deleted chunks from the FTS search index.
CREATE TRIGGER IF NOT EXISTS document_chunks_fts_delete
AFTER DELETE ON document_chunks
BEGIN
    DELETE FROM document_chunks_fts
    WHERE chunk_id = OLD.id;
END;

-- Automatically update FTS when an existing chunk changes.
CREATE TRIGGER IF NOT EXISTS document_chunks_fts_update
AFTER UPDATE ON document_chunks
BEGIN
    DELETE FROM document_chunks_fts
    WHERE chunk_id = OLD.id;

    INSERT INTO document_chunks_fts (
        chunk_id,
        document_id,
        content,
        source
    )
    SELECT
        NEW.id,
        NEW.document_id,
        NEW.content,
        documents.source
    FROM documents
    WHERE documents.id = NEW.document_id;
END;

-- Add existing chunks to the FTS index.
INSERT INTO document_chunks_fts (
    chunk_id,
    document_id,
    content,
    source
)
SELECT
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    documents.source
FROM document_chunks
JOIN documents
    ON documents.id = document_chunks.document_id;