
type IngestBody = {
    id?: unknown;
    content?: unknown;
    source?: unknown;
};

type OptnChunkMetadata = {
    policyNumber: string;
    policyTitle: string;
    sectionNumber: string;
    sectionTitle: string;
    sectionType: string;
    chunkIndex: number;
    source: string;
};

type OptnChunk = {
    id: string;
    text: string;
    metadata: OptnChunkMetadata;
};

type IngestChunksBody = {
    chunks?: unknown;
};

type SearchBody = {
    query?: unknown;
};

type ReflectionResult = {
    supported: boolean;
    issues: string[];
    revisedAnswer: string;
};

type RetrievalAssessment = {
    sufficient: boolean;
    reason: string;
    rewrittenQuery: string;
};

type HybridRetrievalResult = {
    id: string;
    score: number;
    content: string;
    source: string | null;
    doc_type: string;
};

const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5" as const;
const GENERATION_MODEL = "@cf/google/gemma-4-26b-a4b-it" as const;
const EMBEDDING_DIMENSIONS = 384;
const MIN_SIMILARITY_SCORE = 0.60;

type DocumentChunk = {
    content: string;
    startChar: number;
    endChar: number;
};

function getEmbeddingVector(
    result: any,
    index: number,
): number[] | undefined {
    const payload =
        result?.data ??
        result?.result ??
        result?.embeddings ??
        result?.[0];

    if (!Array.isArray(payload)) {
        return undefined;
    }

    const vector = payload[index];

    return Array.isArray(vector) ? vector : undefined;
}

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

        const nextTarget = Math.max(
            end - overlap,
            start + 1,
        );

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

type RankedResult = {
    id: string;
};

type FusedResult = {
    id: string;
    rrfScore: number;
};

export function reciprocalRankFusion(
    semanticResults: RankedResult[],
    lexicalResults: RankedResult[],
    k = 60,
): FusedResult[] {
    const scores = new Map<string, number>();

    const addRanking = (results: RankedResult[]) => {
        results.forEach((result, index) => {
            const rank = index + 1;
            const currentScore =
                scores.get(result.id) ?? 0;

            scores.set(
                result.id,
                currentScore + 1 / (k + rank),
            );
        });
    };

    addRanking(semanticResults);
    addRanking(lexicalResults);

    return Array.from(scores.entries())
        .map(([id, rrfScore]) => ({
            id,
            rrfScore,
        }))
        .sort(
            (a, b) =>
                b.rrfScore - a.rrfScore,
        );
}

export function buildFtsQuery(query: string): string {
    return query
        .toLowerCase()
        .split(/\s+/)
        .map((term) =>
            term.replace(/[^\p{L}\p{N}_-]/gu, ""),
        )
        .filter((term) => term.length > 0)
        .map((term) => `"${term}"`)
        .join(" OR ");
}

export function extractCitationNumbers(
    answer: string,
): number[] {
    const citations = new Set<number>();

    const regex = /Source\s+(\d+)/gi;

    for (const match of answer.matchAll(regex)) {
        const sourceNumber = Number(match[1]);

        if (Number.isInteger(sourceNumber)) {
            citations.add(sourceNumber);
        }
    }

    return Array.from(citations);
}

export function validateCitationNumbers(
    citationNumbers: number[],
    sourceCount: number,
): number[] {
    return citationNumbers.filter(
        (sourceNumber) =>
            sourceNumber >= 1 &&
            sourceNumber <= sourceCount,
    );
}
export function buildRetrievalAssessmentPrompt(
    query: string,
    context: string,
): string {
    return `
You are evaluating whether retrieved evidence is sufficient to answer a user's question.

User question:

${query}

Retrieved evidence:

${context}

Determine whether the retrieved evidence directly addresses the user's question.

Return valid JSON with exactly this structure:

{
  "sufficient": true,
  "reason": "...",
  "rewrittenQuery": ""
}

Rules:
- Set "sufficient" to true only when the retrieved evidence contains enough information to answer the user's question.
- Do not answer the user's question.
- Do not use outside knowledge.
- Evaluate the evidence based on meaning, not just keyword overlap.
- If the evidence is sufficient, set "rewrittenQuery" to an empty string.
- If the evidence is insufficient, rewrite the user's question into a concise domain-specific retrieval query.
- Prefer terminology likely to appear in formal policy or regulatory documents rather than conversational wording.
- Preserve the user's original meaning.
- Preserve the user's original intent when rewriting.
`.trim();
}
export function parseRetrievalAssessment(
    text: string,
): RetrievalAssessment | null {
    try {
        const cleaned = text
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        const parsed = JSON.parse(cleaned);

        if (
            typeof parsed.sufficient !== "boolean" ||
            typeof parsed.reason !== "string" ||
            typeof parsed.rewrittenQuery !== "string"
        ) {
            return null;
        }

        return {
            sufficient: parsed.sufficient,
            reason: parsed.reason,
            rewrittenQuery: parsed.rewrittenQuery,
        };
    } catch {
        return null;
    }
}
export function buildReflectionPrompt(
    answer: string,
    context: string,
): string {
    return `
You are verifying whether an answer is supported by retrieved evidence.

Retrieved evidence:

${context}

Draft answer:

${answer}

Evaluate the draft answer using only the retrieved evidence.

Return valid JSON with exactly this structure:

{
  "supported": true,
  "issues": [],
  "revisedAnswer": "..."
}

Rules:
- Set "supported" to true only when every factual claim in the draft answer is supported by the retrieved evidence.
- Check that cited sources actually support the claims attached to them.
- Do not use outside knowledge.
- Do not invent facts.
- If a claim is unsupported or contradicted, set "supported" to false.
- Describe unsupported or contradicted claims in "issues".
- If the answer is fully supported, preserve it in "revisedAnswer".
- If it is not fully supported, rewrite "revisedAnswer" using only supported information.
`.trim();
}

export function parseReflectionResult(
    text: string,
): ReflectionResult | null {
    try {
        const cleaned = text
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        const parsed = JSON.parse(cleaned);

        if (
            typeof parsed.supported !== "boolean" ||
            !Array.isArray(parsed.issues) ||
            !parsed.issues.every(
                (issue: unknown) =>
                    typeof issue === "string",
            ) ||
            typeof parsed.revisedAnswer !== "string"
        ) {
            return null;
        }

        return {
            supported: parsed.supported,
            issues: parsed.issues,
            revisedAnswer: parsed.revisedAnswer,
        };
    } catch {
        return null;
    }
}
async function retrieveHybrid(
    query: string,
    env: Env,
): Promise<HybridRetrievalResult[]> {
    const embeddingResult = await env.AI.run(
        EMBEDDING_MODEL,
        {
            text: [query],
            pooling: "cls",
        },
    );

    const queryVector =
        getEmbeddingVector(embeddingResult, 0);

    if (
        !queryVector ||
        queryVector.length !== EMBEDDING_DIMENSIONS
    ) {
        throw new Error(
            "A valid query embedding was not generated.",
        );
    }

    const searchResults =
        await env.VECTORIZE.query(
            queryVector,
            {
                topK: 5,
                returnMetadata: "all",
            },
        );

    const semanticMatches =
        searchResults.matches
            .filter(
                (match) =>
                    match.score >=
                    MIN_SIMILARITY_SCORE,
            )
            .map((match) => ({
                id: match.id,
            }));

    const ftsQuery = buildFtsQuery(query);

    const lexicalResult = await env.DB
        .prepare(`
            SELECT
                chunk_id AS id,
                bm25(document_chunks_fts)
                    AS lexical_score
            FROM document_chunks_fts
            WHERE document_chunks_fts MATCH ?
            ORDER BY lexical_score
            LIMIT 5
        `)
        .bind(ftsQuery)
        .all<{
            id: string;
            lexical_score: number;
        }>();

    const fusedResults =
        reciprocalRankFusion(
            semanticMatches,
            lexicalResult.results.map(
                (match) => ({
                    id: match.id,
                }),
            ),
        )
        .slice(0, 5);

    const results: HybridRetrievalResult[] = [];

    for (const fusedResult of fusedResults) {
        const chunk = await env.DB
            .prepare(`
                SELECT
                    document_chunks.id,
                    document_chunks.content,
                    documents.source
                FROM document_chunks
                JOIN documents
                    ON documents.id =
                    document_chunks.document_id
                WHERE document_chunks.id = ?
            `)
            .bind(fusedResult.id)
            .first<{
                id: string;
                content: string;
                source: string | null;
            }>();

        if (chunk) {
            results.push({
                id: chunk.id,
                score: fusedResult.rrfScore,
                content: chunk.content,
                source: chunk.source,
                doc_type: "chunk",
            });
        }
    }

    return results;
}
export default {
    async fetch(request, env, ctx): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/") {
            return Response.json({
                message: "My RAG application is running",
                status: "ready",
            });
        }

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
                        error: "The request body must be valid JSON.",
                    },
                    { status: 400 },
                );
            }

            if (
                typeof body.query !== "string" ||
                !body.query.trim()
            ) {
                return Response.json(
                    {
                        error: "Please provide a non-empty query.",
                    },
                    { status: 400 },
                );
            }

            const query = body.query.trim();
            let searchQuery = query;

            try {
                const embeddingResult =
                    await env.AI.run(
                        EMBEDDING_MODEL,
                        {
                            text: [searchQuery],
                            pooling: "cls",
                        },
                    );

                const queryVector =
                    getEmbeddingVector(embeddingResult, 0);

                if (
                    !queryVector ||
                    queryVector.length !== EMBEDDING_DIMENSIONS
                ) {
                    return Response.json(
                        {
                            error:
                                "A valid query embedding was not generated.",
                        },
                        { status: 500 },
                    );
                }

                const searchResults =
                    await env.VECTORIZE.query(
                        queryVector,
                        {
                            topK: 5,
                            returnMetadata: "all",
                        },
                    );

                const ftsQuery = buildFtsQuery(searchQuery);

                const lexicalResult = await env.DB
                    .prepare(
                        `
                        SELECT
                            chunk_id AS id,
                            document_id,
                            content,
                            source,
                            bm25(document_chunks_fts) AS lexical_score
                        FROM document_chunks_fts
                        WHERE document_chunks_fts MATCH ?
                        ORDER BY lexical_score
                        LIMIT 5
                        `,
                    )
                    .bind(ftsQuery)
                    .all<{
                        id: string;
                        document_id: string;
                        content: string;
                        source: string | null;
                        lexical_score: number;
                    }>();

                const lexicalMatches = lexicalResult.results;

                const matches =
                    searchResults.matches
                        .filter(
                            (match) =>
                                match.score >=
                                MIN_SIMILARITY_SCORE,
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
                                    : null,
                        }));

                const fusedResults = reciprocalRankFusion(
                    matches.map((match) => ({
                        id: match.id,
                    })),
                    lexicalMatches.map((match) => ({
                        id: match.id,
                    })),
                );

                const topFusedResults = fusedResults.slice(0, 5);

                const fusedMatches: Array<{
                    id: string;
                    score: number;
                    content: string;
                    source: string | null;
                    doc_type: string;
                }> = [];

                for (const fusedResult of topFusedResults) {
                    const chunk = await env.DB
                        .prepare(
                            `
                            SELECT
                                document_chunks.id,
                                document_chunks.content,
                                documents.source
                            FROM document_chunks
                            JOIN documents
                                ON documents.id =
                                document_chunks.document_id
                            WHERE document_chunks.id = ?
                            `,
                        )
                        .bind(fusedResult.id)
                        .first<{
                            id: string;
                            content: string;
                            source: string | null;
                        }>();

                    if (chunk) {
                        fusedMatches.push({
                            id: chunk.id,
                            score: fusedResult.rrfScore,
                            content: chunk.content,
                            source: chunk.source,
                            doc_type: "chunk",
                        });
                    }
                }

                if (fusedMatches.length === 0) {
                    return Response.json({
                        query,
                        answer:
                            "I do not have enough information in the supplied documents to answer this question.",
                        sources: [],
                    });
                }
                let activeMatches = fusedMatches;
                let context = activeMatches
                    .filter((match) => match.content !== null)
                    .map(
                        (match, index) =>
                            `[Source ${index + 1}: ${match.id}]

${match.content}`,
                    )
                    .join("\n\n");

                if (!context) {
                    return Response.json({
                        query,
                        answer:
                            "I do not have enough readable context to answer this question.",
                        sources: [],
                    });
                }

                const retrievalAssessmentPrompt =
    buildRetrievalAssessmentPrompt(
        query,
        context,
    );

const retrievalAssessmentResponse =
    await env.AI.run(
        GENERATION_MODEL,
        {
            messages: [
                {
                    role: "user",
                    content: retrievalAssessmentPrompt,
                },
            ],
            temperature: 0,
            max_tokens: 300,
            chat_template_kwargs: {
                enable_thinking: false,
            },
        },
    );

const retrievalAssessmentContent =
    retrievalAssessmentResponse.choices?.[0]
        ?.message?.content;

const retrievalAssessment =
    typeof retrievalAssessmentContent === "string"
        ? parseRetrievalAssessment(
            retrievalAssessmentContent,
        )
        : null;

if (
    retrievalAssessment &&
    !retrievalAssessment.sufficient &&
    retrievalAssessment.rewrittenQuery.trim()
) {
    searchQuery =
        retrievalAssessment.rewrittenQuery.trim();
}

let retrySearchResults = null;

if (searchQuery !== query) {
    const retryEmbeddingResult =
        await env.AI.run(
            EMBEDDING_MODEL,
            {
                text: [searchQuery],
                pooling: "cls",
            },
        );

    const retryQueryVector =
        getEmbeddingVector(
            retryEmbeddingResult,
            0,
        );

    if (
        retryQueryVector &&
        retryQueryVector.length ===
            EMBEDDING_DIMENSIONS
    ) {
        retrySearchResults =
            await env.VECTORIZE.query(
                retryQueryVector,
                {
                    topK: 5,
                    returnMetadata: "all",
                },
            );
    }
}
let retryMatches: {
    id: string;
    score: number;
    content: string;
    source: string | null;
    doc_type: string;
}[] = [];

if (retrySearchResults) {
    for (const match of retrySearchResults.matches) {
        if (
            match.score <
            MIN_SIMILARITY_SCORE
        ) {
            continue;
        }

        const chunk = await env.DB
            .prepare(`
                SELECT
                    document_chunks.id,
                    document_chunks.content,
                    documents.source
                FROM document_chunks
                JOIN documents
                    ON documents.id =
                    document_chunks.document_id
                WHERE document_chunks.id = ?
            `)
            .bind(match.id)
            .first<{
                id: string;
                content: string;
                source: string | null;
            }>();

        if (chunk) {
            retryMatches.push({
                id: chunk.id,
                score: match.score,
                content: chunk.content,
                source: chunk.source,
                doc_type: "chunk",
            });
        }
    }
}
if (retryMatches.length > 0) {
    activeMatches = retryMatches;

    context = activeMatches
        .map(
            (match, index) =>
                `[Source ${index + 1}]\n${match.content}`,
        )
        .join("\n\n");
}

                const generationResult =
                    await env.AI.run(
                        GENERATION_MODEL,
                        {
                            messages: [
                                {
                                    role: "system",
                                    content:
                                        "Answer only from the supplied context. Cite each factual claim using the minimum number of supporting citations in the format [Source N]. Prefer the single most relevant source when one source is sufficient. Use multiple citations only when multiple sources are genuinely needed to support the claim. Never cite all retrieved sources by default. If the context does not contain enough information, say that you do not have enough information. Do not invent facts.",
                                },
                                {
                                    role: "user",
                                    content: `Context:

${context}

Question:

${query}`,
                                },
                            ],
                            temperature: 0.2,
                            max_tokens: 1000,
                            chat_template_kwargs: {
                                enable_thinking: false,
                            },
                        },
                    );

                const generatedContent =
                    generationResult.choices?.[0]
                        ?.message?.content;

                const answer =
                    typeof generatedContent === "string"
                        ? generatedContent.trim()
                        : "";

                if (!answer) {
                    return Response.json(
                        {
                            error:
                                "The model did not generate an answer.",
                        },
                        { status: 500 },
                    );
                }

                const reflectionPrompt = buildReflectionPrompt(
                    answer,
                    context,
                );

                const reflectionResponse = await env.AI.run(
                    GENERATION_MODEL,
                    {
                        messages: [
                            {
                                role: "user",
                                content: reflectionPrompt,
                            },
                        ],
                        temperature: 0,
                        max_tokens: 1000,
                        chat_template_kwargs: {
                            enable_thinking: false,
                        },
                    },
                );

                const reflectionContent =
                    reflectionResponse.choices?.[0]
                        ?.message?.content;

                const reflection =
                    typeof reflectionContent === "string"
                        ? parseReflectionResult(
                            reflectionContent,
                        )
                        : null;

                const finalAnswer =
                    reflection?.revisedAnswer.trim()
                        ? reflection.revisedAnswer.trim()
                        : answer;

                const extractedCitations =
                    extractCitationNumbers(finalAnswer);

                const validCitationNumbers =
                    validateCitationNumbers(
                        extractedCitations,
                        activeMatches.length,
                    );

                const citations = validCitationNumbers.map(
                    (sourceNumber) => {
                        const match =
                            activeMatches[sourceNumber - 1];

                        return {
                            sourceNumber,
                            id: match.id,
                            source: match.source,
                        };
                    },
                );

                return Response.json({
                    query,
                    answer: finalAnswer,
                    citations,
                    reflection,
                    retrievalAssessment,
                    retrievalRetried: retryMatches.length > 0,
                    retrievalQuery: searchQuery,
                    sources: activeMatches.map(
                        (match) => ({
                            id: match.id,
                            source: match.source,
                            score: match.score,
                            content: match.content,
                        }),
                    ),
                    model: GENERATION_MODEL,
                    usage: generationResult.usage,
                });
            } catch (error) {
                return Response.json(
                    {
                        error:
                            "Semantic search or answer generation failed.",
                        details:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 500 },
                );
            }
        }

        if (
            url.pathname === "/ingest-chunks" &&
            request.method === "POST"
        ) {
            let body: IngestChunksBody;

            try {
                body = await request.json<IngestChunksBody>();
            } catch {
                return Response.json(
                    { error: "The request body must be valid JSON." },
                    { status: 400 },
                );
            }

            if (!Array.isArray(body.chunks) || body.chunks.length === 0) {
                return Response.json(
                    { error: "Please provide a non-empty chunks array." },
                    { status: 400 },
                );
            }

            const chunks = body.chunks as OptnChunk[];

            for (const chunk of chunks) {
                if (
                    typeof chunk.id !== "string" ||
                    !chunk.id.trim() ||
                    typeof chunk.text !== "string" ||
                    !chunk.text.trim() ||
                    !chunk.metadata ||
                    typeof chunk.metadata.policyNumber !== "string" ||
                    typeof chunk.metadata.policyTitle !== "string" ||
                    typeof chunk.metadata.sectionNumber !== "string" ||
                    typeof chunk.metadata.sectionTitle !== "string" ||
                    typeof chunk.metadata.sectionType !== "string" ||
                    typeof chunk.metadata.chunkIndex !== "number" ||
                    typeof chunk.metadata.source !== "string"
                ) {
                    return Response.json(
                        { error: "One or more OPTN chunks are invalid." },
                        { status: 400 },
                    );
                }
            }

            try {
                const textsForEmbedding = chunks.map(
                    (chunk) => chunk.text,
                );

                const embeddingResult = await env.AI.run(
                    EMBEDDING_MODEL,
                    {
                        text: textsForEmbedding,
                        pooling: "cls",
                    },
                );

                const vectors = chunks.map((chunk, index) => {
                    const vector = getEmbeddingVector(
                        embeddingResult,
                        index,
                    );

                    if (
                        !vector ||
                        vector.length !== EMBEDDING_DIMENSIONS
                    ) {
                        throw new Error(
                            `A valid embedding was not generated for ${chunk.id}.`,
                        );
                    }

                    return {
                        id: chunk.id,
                        values: vector,
                        metadata: {
                            document_id: "optn-policies",
                            policyNumber: chunk.metadata.policyNumber,
                            policyTitle: chunk.metadata.policyTitle,
                            sectionNumber: chunk.metadata.sectionNumber,
                            sectionTitle: chunk.metadata.sectionTitle,
                            sectionType: chunk.metadata.sectionType,
                            chunkIndex: chunk.metadata.chunkIndex,
                            source: chunk.metadata.source,
                            doc_type: "optn_policy_chunk",
                        },
                    };
                });

                await env.DB.prepare(
                    `INSERT INTO documents
                        (id, content, source)
                     VALUES (?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                        source = excluded.source`,
                )
                    .bind(
                        "optn-policies",
                        "OPTN Policies",
                        "OPTN Policies",
                    )
                    .run();

                for (let index = 0; index < chunks.length; index++) {
                    const chunk = chunks[index];

                    await env.DB.prepare(
                        `INSERT INTO document_chunks
                            (
                                id,
                                document_id,
                                chunk_index,
                                content,
                                start_char,
                                end_char
                            )
                         VALUES (?, ?, ?, ?, ?, ?)
                         ON CONFLICT(id) DO UPDATE SET
                            document_id = excluded.document_id,
                            chunk_index = excluded.chunk_index,
                            content = excluded.content,
                            start_char = excluded.start_char,
                            end_char = excluded.end_char`,
                    )
                        .bind(
                            chunk.id,
                            "optn-policies",
                            chunk.metadata.chunkIndex,
                            chunk.text,
                            0,
                            chunk.text.length,
                        )
                        .run();
                }

                await env.VECTORIZE.upsert(vectors);

                return Response.json({
                    success: true,
                    stage: "optn_chunks_ingested",
                    chunks_received: chunks.length,
                    vectors_upserted: vectors.length,
                    embedding: {
                        model: EMBEDDING_MODEL,
                        dimensions: EMBEDDING_DIMENSIONS,
                    },
                });
            } catch (error) {
                return Response.json(
                    {
                        error: "OPTN chunk ingestion failed.",
                        details:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 500 },
                );
            }
        }

        if (
            url.pathname === "/ingest" &&
            request.method === "POST"
        ) {
            let body: IngestBody;

            try {
                body = await request.json<IngestBody>();
            } catch {
                return Response.json(
                    {
                        error:
                            "The request body must be valid JSON.",
                    },
                    { status: 400 },
                );
            }

            if (
                typeof body.id !== "string" ||
                !body.id.trim()
            ) {
                return Response.json(
                    {
                        error:
                            "Please provide a non-empty document id.",
                    },
                    { status: 400 },
                );
            }

            if (
                typeof body.content !== "string" ||
                !body.content.trim()
            ) {
                return Response.json(
                    {
                        error:
                            "Please provide non-empty document content.",
                    },
                    { status: 400 },
                );
            }

            if (
                body.source !== undefined &&
                typeof body.source !== "string"
            ) {
                return Response.json(
                    {
                        error:
                            "Source must be a string.",
                    },
                    { status: 400 },
                );
            }

            const id = body.id.trim();
            const content = body.content.trim();

            const source =
                typeof body.source === "string"
                    ? body.source.trim()
                    : "";

            try {
                await env.DB.prepare(
                    `INSERT INTO documents
                        (id, content, source)
                     VALUES (?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                        content = excluded.content,
                        source = excluded.source`,
                )
                    .bind(id, content, source)
                    .run();

                const chunks = chunkDocument(content);

                const oldChunkRows = await env.DB.prepare(
                    "SELECT id FROM document_chunks WHERE document_id = ?",
                )
                    .bind(id)
                    .all<{ id: string }>();

                const oldVectorIds = [
                    id,
                    ...oldChunkRows.results.map((row) => row.id),
                ];

                await env.VECTORIZE.deleteByIds(oldVectorIds);

                await env.DB.prepare(
                    "DELETE FROM document_chunks WHERE document_id = ?",
                )
                    .bind(id)
                    .run();

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

                const vectors = chunks.map((chunk, index) => {
                    const vector = getEmbeddingVector(
                        embeddingResult,
                        index,
                    );

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
                    { status: 500 },
                );
            }
        }

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
                            pooling: "cls",
                        },
                    );

                const vector =
                    getEmbeddingVector(embeddingResult, 0);

                if (!vector) {
                    return Response.json(
                        {
                            error:
                                "No embedding was generated.",
                        },
                        { status: 500 },
                    );
                }

                return Response.json({
                    input_text: text,
                    model: EMBEDDING_MODEL,
                    dimensions: vector.length,
                    first_five_numbers:
                        vector.slice(0, 5),
                });
            } catch (error) {
                return Response.json(
                    {
                        error:
                            "Embedding generation failed.",
                        details:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    { status: 500 },
                );
            }
        }

        return Response.json(
            {
                error: "Route not found",
            },
            {
                status: 404,
            },
        );
    },
} satisfies ExportedHandler<Env>;