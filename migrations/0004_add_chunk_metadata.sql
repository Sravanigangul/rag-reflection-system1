-- Migration number: 0004 	 2026-10-26T00:46:47.543Z
ALTER TABLE document_chunks
ADD COLUMN metadata TEXT;