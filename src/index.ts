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

const EMBEDDING_DIMENSIONS = 384;

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

        // 2. Search Vectorize for relevant documents
if (
    url.pathname === "/search" &&
    request.method === "POST"
) {
    let body: SearchBody;

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
        // Convert the question into a 384-number vector.
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

        // Find the five most similar vectors.
        const searchResults =
            await env.VECTORIZE.query(
                queryVector,
                {
                    topK: 5,
                    returnMetadata: "all"
                }
            );

        const matches =
            searchResults.matches.map(
                (match) => ({
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
                })
            );

        return Response.json({
            query,
            match_count: matches.length,
            matches
        });
    } catch (error) {
        return Response.json(
            {
                error: "Semantic search failed.",
                details:
                    error instanceof Error
                        ? error.message
                        : String(error)
            },
            { status: 500 }
        );
    }
}
        // 3. Ingest a document
        if (
            url.pathname === "/ingest" &&
            request.method === "POST"
        ) {
            let body: IngestBody;

            // Convert the incoming JSON into a TypeScript object.
            try {
                body = await request.json<IngestBody>();
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

            // Source is optional, but it must be text if provided.
            if (
                body.source !== undefined &&
                typeof body.source !== "string"
            ) {
                return Response.json(
                    {
                        error: "Source must be a string."
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
                // Store the complete readable document in D1.
                await env.DB.prepare(
                    `INSERT INTO documents (id, content, source)
                     VALUES (?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         content = excluded.content,
                         source = excluded.source`
                )
                    .bind(id, content, source)
                    .run();

                // Temporarily embed only the beginning.
                // We will implement proper chunking later.
                const textForEmbedding =
                    content.slice(0, 1500);

                // Convert the document text into 384 numbers.
                const embeddingResult =
                    await env.AI.run(
                        EMBEDDING_MODEL,
                        {
                            text: [textForEmbedding],
                            pooling: "cls"
                        }
                    );

                const vector =
                    embeddingResult.data[0];

                // Make sure the result matches rag-index.
                if (
                    !vector ||
                    vector.length !==
                        EMBEDDING_DIMENSIONS
                ) {
                    return Response.json(
                        {
                            error:
                                "A valid 384-dimensional embedding was not generated."
                        },
                        { status: 500 }
                    );
                }

                // Store the vector in Vectorize.
                await env.VECTORIZE.upsert([
                    {
                        id,
                        values: vector,
                        metadata: {
                            content:
                                content.slice(0, 1000),
                            source,
                            doc_type: "raw"
                        }
                    }
                ]);

                return Response.json({
                    success: true,
                    stage:
                        "saved_to_d1_and_vectorize",
                    document: {
                        id,
                        source,
                        content_length:
                            content.length
                    },
                    embedding: {
                        model: EMBEDDING_MODEL,
                        dimensions: vector.length
                    }
                });
            } catch (error) {
                return Response.json(
                    {
                        error:
                            "The document could not be ingested.",
                        details:
                            error instanceof Error
                                ? error.message
                                : String(error)
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

        // 5. Fallback for an unknown route
        return Response.json(
            { error: "Route not found" },
            { status: 404 }
        );
    },
} satisfies ExportedHandler<Env>;