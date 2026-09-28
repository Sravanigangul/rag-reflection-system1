type IngestBody = {
    id?: unknown;
    content?: unknown;
    source?: unknown;
};

type SearchBody = {
    query?: unknown;
};

const EMBEDDING_MODEL =
    "@cf/baai/bge-small-en-v1.5" as const;

const GENERATION_MODEL =
    "@cf/google/gemma-4-26b-a4b-it" as const;

const EMBEDDING_DIMENSIONS = 384;
const MIN_SIMILARITY_SCORE = 0.60;

type DocumentChunk = {
	content: string;
	startChar: number;
	endChar: number;
};

export function chunkDocument(
    content: string,
    chunkSize = 1000,
    overlap = 200,
): DocumentChunk[] {
    if (chunkSize <= 0) {
        throw new Error("chunkSize must be greater than 0.");
    }

    if (overlap < 0 || overlap >= chunkSize) {
        throw new Error(
            "overlap must be at least 0 and smaller than chunkSize.",
        );
    }

    const chunks: DocumentChunk[] = [];
    let start = 0;

    while (start < content.length) {
        const maxEnd = Math.min(
            start + chunkSize,
            content.length,
        );

        let end = maxEnd;

        // If more text remains, prefer a natural boundary.
        if (maxEnd < content.length) {
            const candidate = content.slice(start, maxEnd);

            const sentenceEnd = Math.max(
                candidate.lastIndexOf(". "),
                candidate.lastIndexOf("? "),
                candidate.lastIndexOf("! "),
                candidate.lastIndexOf("\n"),
            );

            if (sentenceEnd >= chunkSize * 0.5) {
                end = start + sentenceEnd + 1;
            } else {
                const lastSpace = candidate.lastIndexOf(" ");

                if (lastSpace >= chunkSize * 0.5) {
                    end = start + lastSpace;
                }
            }
        }

        const chunkContent = content
            .slice(start, end)
            .trim();

        if (chunkContent) {
            chunks.push({
                content: chunkContent,
                startChar: start,
                endChar: end,
            });
        }

        if (end >= content.length) {
            break;
        }

        // Move backward to preserve approximate overlap.
        const nextTarget = Math.max(
            end - overlap,
            start + 1,
        );

        // Prefer starting the next chunk at a sentence boundary.
        const overlapText = content.slice(
            nextTarget,
            end,
        );

        const sentenceStarts = [
            overlapText.indexOf(". "),
            overlapText.indexOf("? "),
            overlapText.indexOf("! "),
            overlapText.indexOf("\n"),
        ].filter((position) => position !== -1);

        if (sentenceStarts.length > 0) {
            const firstSentenceBoundary = Math.min(
                ...sentenceStarts,
            );

            start =
                nextTarget +
                firstSentenceBoundary +
                (overlapText[firstSentenceBoundary] === "\n"
                    ? 1
                    : 2);
        } else {
            // Fall back to a word boundary.
            const nextSpace = content.indexOf(
                " ",
                nextTarget,
            );

            if (
                nextSpace !== -1 &&
                nextSpace < end
            ) {
                start = nextSpace + 1;
            } else {
                start = nextTarget;
            }
        }
    }

    return chunks;
}

export default {
    async fetch(request, env, ctx): Promise<Response> {
        const url = new URL(request.url);

        // 1. Home route
        if (url.pathname === "/") {
            return Response.json({
                message: "My RAG application is running",
                status: "ready"
            });
        }

        // 2. Semantic search and answer generation
        if (
            url.pathname === "/search" &&
            request.method === "POST"
        ) {
            let body: SearchBody;

            // Read the JSON request.
            try {
                body = await request.json<SearchBody>();
            } catch {
                return Response.json(
                    {
                        error:
                            "The request body must be valid JSON."
                    },
                    { status: 400 }
                );
            }

            // Validate the question.
            if (
                typeof body.query !== "string" ||
                !body.query.trim()
            ) {
                return Response.json(
                    {
                        error:
                            "Please provide a non-empty query."
                    },
                    { status: 400 }
                );
            }

            const query = body.query.trim();

            try {
                // Convert the question into an embedding.
                const embeddingResult =
                    await env.AI.run(
                        EMBEDDING_MODEL,
                        {
                            text: [query],
                            pooling: "cls"
                        }
                    );

                const queryVector =
                    embeddingResult.data[0];

                if (
                    !queryVector ||
                    queryVector.length !==
                        EMBEDDING_DIMENSIONS
                ) {
                    return Response.json(
                        {
                            error:
                                "A valid query embedding was not generated."
                        },
                        { status: 500 }
                    );
                }

                // Retrieve the five closest candidates.
                const searchResults =
                    await env.VECTORIZE.query(
                        queryVector,
                        {
                            topK: 5,
                            returnMetadata: "all"
                        }
                    );

                // Remove results below the similarity threshold.
                const matches =
                    searchResults.matches
                        .filter(
                            (match) =>
                                match.score >=
                                MIN_SIMILARITY_SCORE
                        )
                        .map((match) => ({
                            id: match.id,
                            score: match.score,

                            content:
                                typeof match.metadata
                                    ?.content === "string"
                                    ? match.metadata.content
                                    : null,

                            source:
                                typeof match.metadata
                                    ?.source === "string"
                                    ? match.metadata.source
                                    : null,

                            doc_type:
                                typeof match.metadata
                                    ?.doc_type === "string"
                                    ? match.metadata.doc_type
                                    : null
                        }));

                // Do not call the LLM if nothing relevant was found.
                if (matches.length === 0) {
                    return Response.json({
                        query,
                        answer:
                            "I do not have enough information in the supplied documents to answer this question.",
                        sources: []
                    });
                }

                // Combine retrieved documents into LLM context.
                const context = matches
                    .filter(
                        (match) =>
                            match.content !== null
                    )
                    .map(
                        (match, index) =>
                            `[Source ${index + 1}: ${match.id}]
${match.content}`
                    )
                    .join("\n\n");

                if (!context) {
                    return Response.json({
                        query,
                        answer:
                            "I do not have enough readable context to answer this question.",
                        sources: []
                    });
                }

                // Generate an answer using only retrieved context.
                const generationResult =
                    await env.AI.run(
                        GENERATION_MODEL,
                        {
                            messages: [
                                {
                                    role: "system",
                                    content:
                                        "Answer only from the supplied context. If the context does not contain enough information, say that you do not have enough information. Do not invent facts."
                                },
                                {
                                    role: "user",
                                    content: `Context:
${context}

Question:
${query}`
                                }
                            ],
                            temperature: 0.2,
                            max_completion_tokens: 200,
                            chat_template_kwargs: {
                                enable_thinking: false
                            }
                        }
                    );

                // Extract only the generated answer.
                const generatedContent =
                    generationResult.choices?.[0]
                        ?.message?.content;

                const answer =
                    typeof generatedContent ===
                    "string"
                        ? generatedContent.trim()
                        : "";

                if (!answer) {
                    return Response.json(
                        {
                            error:
                                "The model did not generate an answer."
                        },
                        { status: 500 }
                    );
                }

                // Return a clean API response.
                return Response.json({
                    query,
                    answer,

                    sources: matches.map(
                        (match) => ({
                            id: match.id,
                            source: match.source,
                            score: match.score,
                            content: match.content
                        })
                    ),

                    model: GENERATION_MODEL,
                    usage: generationResult.usage
                });
            } catch (error) {
                return Response.json(
                    {
                        error:
                            "Semantic search or answer generation failed.",
                        details:
                            error instanceof Error
                                ? error.message
                                : String(error)
                    },
                    { status: 500 }
                );
            }
        }

        // 3. Document ingestion
        if (
            url.pathname === "/ingest" &&
            request.method === "POST"
        ) {
            let body: IngestBody;

            // Read the JSON request.
            try {
                body =
                    await request.json<IngestBody>();
            } catch {
                return Response.json(
                    {
                        error:
                            "The request body must be valid JSON."
                    },
                    { status: 400 }
                );
            }

            // Validate the document ID.
            if (
                typeof body.id !== "string" ||
                !body.id.trim()
            ) {
                return Response.json(
                    {
                        error:
                            "Please provide a non-empty document id."
                    },
                    { status: 400 }
                );
            }

            // Validate the document content.
            if (
                typeof body.content !== "string" ||
                !body.content.trim()
            ) {
                return Response.json(
                    {
                        error:
                            "Please provide non-empty document content."
                    },
                    { status: 400 }
                );
            }

            // Validate the optional source.
            if (
                body.source !== undefined &&
                typeof body.source !== "string"
            ) {
                return Response.json(
                    {
                        error:
                            "Source must be a string."
                    },
                    { status: 400 }
                );
            }

            const id = body.id.trim();
            const content = body.content.trim();

            const source =
                typeof body.source === "string"
                    ? body.source.trim()
                    : "";

            try {
                // Save complete readable text in D1.
                await env.DB.prepare(
                    `INSERT INTO documents
                        (id, content, source)
                     VALUES (?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                        content = excluded.content,
                        source = excluded.source`
                )
                    .bind(id, content, source)
                    .run();
                // Split the complete document into overlapping chunks.
const chunks = chunkDocument(content);

// Find vectors from the previous version of this document.
const oldChunkRows = await env.DB.prepare(
    "SELECT id FROM document_chunks WHERE document_id = ?",
)
    .bind(id)
    .all<{ id: string }>();

const oldVectorIds = [
    id, // Legacy document-level vector from the old ingestion design.
    ...oldChunkRows.results.map((row) => row.id),
];

// Remove old vectors so stale content cannot be retrieved.
await env.VECTORIZE.deleteByIds(oldVectorIds);

// Remove old D1 chunks before saving the new version.
await env.DB.prepare(
    "DELETE FROM document_chunks WHERE document_id = ?",
)
    .bind(id)
    .run();

                // Save each chunk in D1 with its position in the source document.
                for (let index = 0; index < chunks.length; index++) {
                    const chunk = chunks[index];
                    const chunkId = `${id}-chunk-${index}`;

                    await env.DB.prepare(
                        `INSERT INTO document_chunks
                            (id, document_id, chunk_index, content, start_char, end_char)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                    )
                        .bind(
                            chunkId,
                            id,
                            index,
                            chunk.content,
                            chunk.startChar,
                            chunk.endChar,
                        )
                        .run();
                }

                // Generate one embedding for each document chunk.
                const textsForEmbedding = chunks.map(
                    (chunk) => chunk.content,
                );

                const embeddingResult = await env.AI.run(
                    EMBEDDING_MODEL,
                    {
                        text: textsForEmbedding,
                        pooling: "cls",
                    },
                );

                // Build one Vectorize record for each chunk.
                const vectors = chunks.map((chunk, index) => {
                    const vector = embeddingResult.data[index];

                    if (
                        !vector ||
                        vector.length !== EMBEDDING_DIMENSIONS
                    ) {
                        throw new Error(
                            `A valid embedding was not generated for chunk ${index}.`,
                        );
                    }

                    return {
                        id: `${id}-chunk-${index}`,
                        values: vector,
                        metadata: {
                            document_id: id,
                            chunk_index: index,
                            content: chunk.content,
                            source,
                            doc_type: "chunk",
                            start_char: chunk.startChar,
                            end_char: chunk.endChar,
                        },
                    };
                });

                // Store all chunk embeddings in Vectorize.
                await env.VECTORIZE.upsert(vectors);

                return Response.json({
                    success: true,
                    stage: "saved_to_d1_and_vectorize",
                    document: {
                        id,
                        source,
                        content_length: content.length,
                    },
                    embedding: {
                        model: EMBEDDING_MODEL,
                        dimensions: EMBEDDING_DIMENSIONS,
                        chunks: chunks.length,
                    },
                });
            } catch (error) {
                return Response.json(
                    {
                        error: "The document could not be ingested.",
                        details:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 500 }
                );
            }
        }

        // 4. Standalone embedding test
        if (
            url.pathname === "/test-embedding" &&
            request.method === "GET"
        ) {
            try {
                const text =
                    "Retrieval-augmented generation uses relevant documents to answer questions.";

                const embeddingResult =
                    await env.AI.run(
                        EMBEDDING_MODEL,
                        {
                            text: [text],
                            pooling: "cls"
                        }
                    );

                const vector =
                    embeddingResult.data[0];

                if (!vector) {
                    return Response.json(
                        {
                            error:
                                "No embedding was generated."
                        },
                        { status: 500 }
                    );
                }

                return Response.json({
                    input_text: text,
                    model: EMBEDDING_MODEL,
                    dimensions: vector.length,
                    first_five_numbers:
                        vector.slice(0, 5)
                });
            } catch (error) {
                return Response.json(
                    {
                        error:
                            "Embedding generation failed.",
                        details:
                            error instanceof Error
                                ? error.message
                                : String(error)
                    },
                    { status: 500 }
                );
            }
        }

        // 5. Unknown route
        return Response.json(
            {
                error: "Route not found"
            },
            {
                status: 404
            }
        );
    },
} satisfies ExportedHandler<Env>;