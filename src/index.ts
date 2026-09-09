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

                // Temporarily embed the first 1,500 characters.
                const textForEmbedding =
                    content.slice(0, 1500);

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

                // Store embedding and metadata in Vectorize.
                await env.VECTORIZE.upsert([
                    {
                        id,
                        values: vector,
                        metadata: {
                            content:
                                content.slice(
                                    0,
                                    1000
                                ),
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