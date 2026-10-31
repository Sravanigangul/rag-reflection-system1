import { UI_HTML } from "./ui";
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
type NewDocumentChunk = {
    id: string;
    content: string;
    metadata: {
        document_type: "management_policy" | "invest_bylaws";
        document_title: string;
        section_id: string;
        section_title: string;
        effective_date: number;
        source_file: string;
        parent?: string;
        content_type?: string;
        article_id?: string;
        article_title?: string;
    };
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
    ambiguous: boolean;
    reason: string;
    rewrittenQuery: string;
    clarificationQuestion: string;
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
You are evaluating whether retrieved OPTN policy evidence is sufficient to answer a user's question.

User question:

${query}

Retrieved evidence:

${context}

Evaluate both the user's question and the retrieved evidence.

Return valid JSON with exactly this structure:

{
  "sufficient": true,
  "ambiguous": false,
  "reason": "...",
  "rewrittenQuery": "",
  "clarificationQuestion": ""
}

Rules:
- Set "sufficient" to true only when the retrieved evidence directly contains enough information to answer the user's exact question.
- Related information is not sufficient when it answers a different question.
- Do not infer that a requirement for one item applies to a broader category. For example, a retention period for a specimen does not establish the retention period for an entire medical record.
- If the evidence explicitly states requirements for related concepts but does not state the requirement asked about by the user, set "sufficient" to false.
- Set "ambiguous" to true only when important information is genuinely missing from the user's question and that missing information prevents determining what the user is asking.
- Ambiguity must come from the wording of the user's question, not from gaps or differences in the retrieved evidence.
- Do not mark a question ambiguous merely because the retrieved evidence discusses related concepts or uses different terminology.
- If the user's requested concept is clear but the retrieved evidence does not directly answer it, set "ambiguous" to false and "sufficient" to false.
- Examples of genuine ambiguity include a question where organ type, donor versus candidate context, or another distinction is omitted and different choices would materially change the policy answer.
- Do not mark a question ambiguous merely because it is broad if the retrieved evidence supports a clear, useful answer.
- If "ambiguous" is true, set "sufficient" to false.
- If "ambiguous" is true, provide one concise clarification question in "clarificationQuestion".
- If "ambiguous" is true, set "rewrittenQuery" to an empty string.
- If the question is not ambiguous but the evidence is insufficient, rewrite the user's question into a concise domain-specific retrieval query in "rewrittenQuery".
- Prefer terminology likely to appear in formal OPTN policy documents when rewriting.
- If the evidence is sufficient, set both "rewrittenQuery" and "clarificationQuestion" to empty strings.
- Preserve the user's original meaning.
- Preserve specific domain terminology already present in the user's question when rewriting.
- When rewriting, preserve the user's underlying intent, not just the topic. If the user asks whether something is allowed, accepted, eligible, prohibited, required, or excluded, use terminology reflecting that decision or eligibility intent rather than rewriting it only as an evaluation, assessment, or documentation question.
- Do not replace explicit user terminology with a different policy concept or policy number merely because the retrieved evidence references it.
- Do not answer the user's question.
- Do not use outside knowledge.
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
            typeof parsed.ambiguous !== "boolean" ||
            typeof parsed.reason !== "string" ||
            typeof parsed.rewrittenQuery !== "string" ||
            typeof parsed.clarificationQuestion !== "string"
        ) {
            return null;
        }

        return {
            sufficient: parsed.sufficient,
            ambiguous: parsed.ambiguous,
            reason: parsed.reason,
            rewrittenQuery: parsed.rewrittenQuery,
            clarificationQuestion: parsed.clarificationQuestion,
        };
    } catch {
        return null;
    }
}
export function buildReflectionPrompt(
    query: string,
    answer: string,
    context: string,
): string {
    return `
You are a healthcare policy answer reviewer.

Your task is to evaluate whether the draft answer is
factually supported AND sufficiently complete.

Original user question:

${query}

Retrieved policy evidence:

${context}

Draft answer:

${answer}

Return valid JSON with exactly this structure:

{
  "supported": true,
  "issues": [],
  "revisedAnswer": "..."
}

Rules:
- Use only the retrieved evidence.
- Verify that every factual claim is supported.
- Verify that citations support their associated claims.
- Check whether the answer addresses the original question.
- Identify material procedural steps, conditions, exceptions,
  and required actions relevant to the question.
- Check whether the draft omits any of those requirements.
- Do not add unrelated policy information.
- Do not invent requirements or use outside knowledge.
- If any claim is unsupported, contradicted, or a material
  requirement is omitted, set "supported" to false.
- Describe each problem in "issues".
- If the answer is accurate and complete, preserve it.
- Otherwise, revise the answer using only retrieved evidence.
- Include citations for all material policy requirements.
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
type ExecutionTrace = {
    traceId: string;
    status: string;
    latencyMs: number;
    retrievalQueryChanged?: boolean;
    retrievalRetried?: boolean;
    retrievedChunkIds?: string[];
    retrievalAssessment?: {
        sufficient: boolean;
        ambiguous: boolean;
    } | null;
    reflectionSupported?: boolean | null;
    reflectionIssues?: string[];
    citationCount?: number;
    modelName?: string;
    errorType?: string | null;
};

async function saveExecutionTrace(
    db: Env["DB"],
    trace: ExecutionTrace,
): Promise<void> {
    await db.prepare(`
        INSERT INTO rag_execution_traces (
            trace_id,
            status,
            latency_ms,
            retrieval_query_changed,
            retrieval_retried,
            retrieved_chunk_ids,
            retrieval_assessment,
            reflection_supported,
            reflection_issues,
            citation_count,
            model_name,
            error_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
        trace.traceId,
        trace.status,
        trace.latencyMs,
        Number(trace.retrievalQueryChanged ?? false),
        Number(trace.retrievalRetried ?? false),
        JSON.stringify(trace.retrievedChunkIds ?? []),
        trace.retrievalAssessment
            ? JSON.stringify(trace.retrievalAssessment)
            : null,
        trace.reflectionSupported == null
            ? null
            : Number(trace.reflectionSupported),
        JSON.stringify(trace.reflectionIssues ?? []),
        trace.citationCount ?? 0,
        trace.modelName ?? null,
        trace.errorType ?? null,
    )
    .run();
}
export default {
    async fetch(request, env, ctx): Promise<Response> {
        const url = new URL(request.url);
        const protectedPaths = new Set([
    "/ingest",
    "/ingest-chunks",
    "/ingest-documents",
    "/index-documents",
]);

if (
    request.method === "POST" &&
    protectedPaths.has(url.pathname)
) {
    const authorization = request.headers.get("Authorization");
    const expectedAuthorization = `Bearer ${env.ADMIN_TOKEN}`;

    if (
        !env.ADMIN_TOKEN ||
        authorization !== expectedAuthorization
    ) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }
}
        if (
    request.method === "GET" &&
    url.pathname === "/"
) {
    return new Response(
        UI_HTML,
        {
            headers: {
                "Content-Type":
                    "text/html; charset=UTF-8",
            },
        },
    );
}
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

            // Unique identifier and start time for this search request.
            const traceId = crypto.randomUUID();
            const traceStartedAt = Date.now();


            try {
                const retrievalStartedAt = Date.now();
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
                        traceId,
                        latencyMs: Date.now() - traceStartedAt,
                        answer:
                            "I do not have enough information in the supplied documents to answer this question.",
                        sources: [],
                    });
                }
                const retrievalLatencyMs = Date.now() - retrievalStartedAt;
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
                        traceId,
                        latencyMs: Date.now() - traceStartedAt,
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

const assessmentStartedAt = Date.now();
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

const assessmentLatencyMs = Date.now() - assessmentStartedAt;
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
    retrievalAssessment.ambiguous
) {
    ctx.waitUntil(saveExecutionTrace(env.DB, { traceId, status: "clarification_required", latencyMs: Date.now() - traceStartedAt, retrievalQueryChanged: searchQuery !== query, retrievalRetried: false, retrievedChunkIds: activeMatches.map((match) => match.id), retrievalAssessment: { sufficient: retrievalAssessment.sufficient, ambiguous: retrievalAssessment.ambiguous }, reflectionSupported: null, reflectionIssues: [], citationCount: 0, modelName: GENERATION_MODEL }).catch((error) => console.error("Trace persistence failed:", error)));
    return Response.json({
        query,
        traceId,
        latencyMs: Date.now() - traceStartedAt,
        answer:
            retrievalAssessment.clarificationQuestion ||
            "Could you provide a little more detail about your question?",
        citations: [],
        reflection: {
            supported: true,
            issues: [],
            revisedAnswer: null,
        },
        retrievalAssessment,
        retryAssessment: null,
        retrievalRetried: false,
        retrievalQuery: searchQuery,
        clarificationRequired: true,
        sources: activeMatches.map(
            (match) => ({
                id: match.id,
                source: match.source,
                score: match.score,
                content: match.content,
            }),
        ),
    });
}
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
let retryAssessment: RetrievalAssessment | null = null;

if (retryMatches.length > 0) {
    const retryAssessmentPrompt =
        buildRetrievalAssessmentPrompt(
            query,
            context,
        );

    const retryAssessmentResponse =
        await env.AI.run(
            GENERATION_MODEL,
            {
                messages: [
                    {
                        role: "user",
                        content: retryAssessmentPrompt,
                    },
                ],
                temperature: 0,
                max_tokens: 300,
                chat_template_kwargs: {
                    enable_thinking: false,
                },
            },
        );

    const retryAssessmentContent =
        retryAssessmentResponse.choices?.[0]
            ?.message?.content;

    retryAssessment =
        typeof retryAssessmentContent === "string"
            ? parseRetrievalAssessment(
                retryAssessmentContent,
            )
            : null;
}
if (
    retryAssessment &&
    retryAssessment.ambiguous
) {
    ctx.waitUntil(
        saveExecutionTrace(env.DB, {
            traceId,
            status: "clarification_required",
            latencyMs: Date.now() - traceStartedAt,
            retrievalQueryChanged: searchQuery !== query,
            retrievalRetried: true,
            retrievedChunkIds: activeMatches.map(
                (match) => match.id,
            ),
            retrievalAssessment: {
                sufficient: retryAssessment.sufficient,
                ambiguous: retryAssessment.ambiguous,
            },
            reflectionSupported: null,
            reflectionIssues: [],
            citationCount: 0,
            modelName: GENERATION_MODEL,
        }).catch((error) =>
            console.error("Trace persistence failed:", error),
        ),
    );

    return Response.json({
        query,
        traceId,
        latencyMs: Date.now() - traceStartedAt,
        answer:
            retryAssessment.clarificationQuestion ||
            "Could you provide a little more detail about your question?",
        citations: [],
        reflection: {
            supported: true,
            issues: [],
            revisedAnswer: null,
        },
        retrievalAssessment,
        retryAssessment,
        retrievalRetried: true,
        retrievalQuery: searchQuery,
        clarificationRequired: true,
        sources: activeMatches.map(
            (match) => ({
                id: match.id,
                source: match.source,
                score: match.score,
                content: match.content,
            }),
        ),
    });
}
if (
    retryAssessment &&
    !retryAssessment.sufficient
) {
    ctx.waitUntil(
        saveExecutionTrace(env.DB, {
            traceId,
            status: "insufficient_evidence",
            latencyMs: Date.now() - traceStartedAt,
            retrievalQueryChanged: searchQuery !== query,
            retrievalRetried: true,
            retrievedChunkIds: activeMatches.map(
                (match) => match.id,
            ),
            retrievalAssessment: {
                sufficient: retryAssessment.sufficient,
                ambiguous: retryAssessment.ambiguous,
            },
            reflectionSupported: null,
            reflectionIssues: [],
            citationCount: 0,
            modelName: GENERATION_MODEL,
        }).catch((error) =>
            console.error("Trace persistence failed:", error),
        ),
    );

    return Response.json({
        query,
        traceId,
        latencyMs: Date.now() - traceStartedAt,
        answer:
            "I do not have enough information in the retrieved OPTN policy evidence to answer this question.",
        citations: [],
        reflection: {
            supported: true,
            issues: [],
            revisedAnswer: null,
        },
        clarificationRequired: false,
        retrievalAssessment,
        retryAssessment,
        retrievalRetried: true,
        retrievalQuery: searchQuery,
        sources: activeMatches.map(
            (match) => ({
                id: match.id,
                source: match.source,
                score: match.score,
                content: match.content,
            }),
        ),
    });
}

                const generationStartedAt = Date.now();
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

                const generationLatencyMs = Date.now() - generationStartedAt;
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
                    query,
                    answer,
                    context,
                );

                const reflectionStartedAt = Date.now();
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

                const reflectionLatencyMs = Date.now() - reflectionStartedAt;
                const reflectionContent =
                    reflectionResponse.choices?.[0]
                        ?.message?.content;

                const reflection =
                    typeof reflectionContent === "string"
                        ? parseReflectionResult(
                            reflectionContent,
                        )
                        : null;

                console.log("RAG reflection diagnostics:", JSON.stringify({ contentType: typeof reflectionContent, contentLength: typeof reflectionContent === "string" ? reflectionContent.length : null, finishReason: reflectionResponse.choices?.[0]?.finish_reason ?? null, parseSucceeded: reflection !== null }));
                console.log("RAG stage latency:", JSON.stringify({ retrievalLatencyMs, assessmentLatencyMs, generationLatencyMs, reflectionLatencyMs }));
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
                const traceLatencyMs = Date.now() - traceStartedAt;

                ctx.waitUntil(
                    saveExecutionTrace(env.DB, {
                        traceId,
                        status: retrievalAssessment?.sufficient === false
    ? "insufficient_evidence"
    : "success",
                        latencyMs: traceLatencyMs,
                        retrievalQueryChanged: searchQuery !== query,
                        retrievalRetried: retryMatches.length > 0,
                        retrievedChunkIds: activeMatches.map(
                            (match) => match.id,
                        ),
                        retrievalAssessment: retrievalAssessment
                            ? {
                                sufficient: retrievalAssessment.sufficient,
                                ambiguous: retrievalAssessment.ambiguous,
                            }
                            : null,
                        reflectionSupported: reflection?.supported ?? null,
                        reflectionIssues: reflection?.issues ?? ["reflection_parse_failed"],
                        citationCount: citations.length,
                        modelName: GENERATION_MODEL,
                    }).catch((error) => {
                        console.error("Trace persistence failed:", error);
                    }),
                );
                return Response.json({
                    query,
                    traceId,
                    latencyMs: Date.now() - traceStartedAt,
                    answer: finalAnswer,
                    citations,
                    reflection,
                    retrievalAssessment,
                    retrievalRetried: retryMatches.length > 0,
                    retrievalQuery: searchQuery,
                    clarificationRequired: false,
                    retryAssessment,
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
                ctx.waitUntil(
        saveExecutionTrace(env.DB, {
            traceId,
            status: "error",
            latencyMs: Date.now() - traceStartedAt,
            retrievalQueryChanged: searchQuery !== query,
            retrievalRetried: false,
            retrievedChunkIds: [],
            retrievalAssessment: null,
            reflectionSupported: null,
            reflectionIssues: [],
            citationCount: 0,
            modelName: GENERATION_MODEL,
            errorType: "search_pipeline_error",
        }).catch((traceError) =>
            console.error("Trace persistence failed:", traceError),
        ),
    );
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
} // End of /ingest-documents endpoint

if (
    url.pathname === "/ingest-documents" &&
    request.method === "POST"
) {
    let body: { chunks: NewDocumentChunk[] };

try {
    body = await request.json<{ chunks: NewDocumentChunk[] }>();
} catch {
    return Response.json(
        { error: "The request body must be valid JSON." },
        { status: 400 },
    );
}

if (!body || !Array.isArray(body.chunks) || body.chunks.length === 0) {
    return Response.json(
        { error: "Please provide a non-empty chunks array." },
        { status: 400 },
    );
}

for (const chunk of body.chunks) {
    if (
        !chunk ||
        typeof chunk.id !== "string" ||
        !chunk.id.trim() ||
        typeof chunk.content !== "string" ||
        !chunk.content.trim() ||
        !chunk.metadata ||
        !["management_policy", "invest_bylaws"].includes(chunk.metadata.document_type) ||
        typeof chunk.metadata.document_title !== "string" ||
        !chunk.metadata.document_title.trim() ||
        typeof chunk.metadata.effective_date !== "number" ||
        !Number.isFinite(chunk.metadata.effective_date) ||
        typeof chunk.metadata.source_file !== "string" ||
        !chunk.metadata.source_file.trim()
    ) {
        return Response.json(
            { error: "One or more document chunks are invalid." },
            { status: 400 },
        );
    }
}
const chunkIds = body.chunks.map((chunk) => chunk.id);

if (new Set(chunkIds).size !== chunkIds.length) {
    return Response.json(
        { error: "Duplicate chunk IDs found in the request." },
        { status: 400 },
    );
}

if (chunkIds.some((id) => id.startsWith("optn-policy-"))) {
    return Response.json(
        { error: "New document ingestion cannot use OPTN policy chunk IDs." },
        { status: 400 },
    );
}
// Prevent overwriting any existing D1 chunks.
for (const chunk of body.chunks) {
    const existing = await env.DB.prepare(
        "SELECT id FROM document_chunks WHERE id = ?"
    )
        .bind(chunk.id)
        .first<{ id: string }>();

    if (existing) {
        return Response.json(
            {
                error: "Chunk ID already exists in D1.",
                chunk_id: chunk.id,
            },
            { status: 409 }
        );
    }
}
const documentIds = {
    management_policy: "optn-management-policies",
    invest_bylaws: "invest-bylaws",
} as const;

const documentTypes = [
    ...new Set(body.chunks.map((chunk) => chunk.metadata.document_type)),
];

const documentsToIngest = documentTypes.map((type) => ({
    document_type: type,
    document_id: documentIds[type],
    chunks: body.chunks.filter(
        (chunk) => chunk.metadata.document_type === type,
    ).length,
}));
// Prepare D1 statements for the new documents.
// These statements are not executed yet.
const d1Statements: D1PreparedStatement[] = [];

for (const type of documentTypes) {
    const documentChunks = body.chunks.filter(
        (chunk) => chunk.metadata.document_type === type
    );

    const documentId = documentIds[type];
    const firstChunk = documentChunks[0];


    d1Statements.push(
        env.DB.prepare(
            `INSERT INTO documents (id, content, source)
             VALUES (?, ?, ?)
            ON CONFLICT(id) DO NOTHING`
        ).bind(
            documentId,
            firstChunk.metadata.document_title,
            firstChunk.metadata.source_file
        )
    );

    for (let index = 0; index < documentChunks.length; index++) {
        const chunk = documentChunks[index];

        d1Statements.push(
            env.DB.prepare(
                `INSERT INTO document_chunks
                 (id, document_id, chunk_index, content,
                  start_char, end_char, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                chunk.id,
                documentId,
                index,
                chunk.content,
                0,
                chunk.content.length,
                JSON.stringify(chunk.metadata)
            )
        );
    }
}
try {
    await env.DB.batch(d1Statements);

    return Response.json({
        success: true,
        stage: "d1_inserted",
        chunks_received: body.chunks.length,
        documents: documentsToIngest,
    });
} catch (error) {
    console.error("D1 ingestion failed:", error);

    return Response.json(
        {
            success: false,
            error: "D1 ingestion failed.",
        },
        { status: 500 }
    );
} // End of catch block

} // End of /ingest-documents
if (
    url.pathname === "/index-documents" &&
    request.method === "POST"
) {
    let body: { chunk_ids?: string[] };

    try {
        body = await request.json<{ chunk_ids?: string[] }>();
    } catch {
        return Response.json(
            { error: "Invalid JSON request body." },
            { status: 400 }
        );
    }

    const chunkIds = body.chunk_ids ?? [];

            if (
                !Array.isArray(chunkIds) ||
                chunkIds.length < 1 ||
                chunkIds.length > 10 ||
                chunkIds.some(
                    (id) => typeof id !== "string" || !id.trim()
                ) ||
                new Set(chunkIds).size !== chunkIds.length
            ) {
                return Response.json(
                    { error: "Provide 1 to 10 unique chunk IDs." },
                    { status: 400 }
                );
            }

            try {
                const placeholders = chunkIds.map(() => "?").join(",");

                const result = await env.DB.prepare(
                    `SELECT id, document_id, content, metadata
                    FROM document_chunks
                    WHERE id IN (${placeholders})
                    AND document_id IN (
                        'optn-management-policies',
                        'invest-bylaws'
                    )`
                )
                    .bind(...chunkIds)
                    .all<{
                        id: string;
                        document_id: string;
                        content: string;
                        metadata: string | null;
                    }>();

                const chunks = result.results ?? [];

                if (chunks.length !== chunkIds.length) {
                    return Response.json(
                        {
                            error: "Some chunk IDs were not found in the new documents.",
                        },
                        { status: 404 }
                    );
                }

                const embeddingResult = await env.AI.run(
                    EMBEDDING_MODEL,
                    {
                        text: chunks.map((chunk) => chunk.content),
                        pooling: "cls",
                    }
                );

                const vectors = chunks.map((chunk, index) => {
                    const values = getEmbeddingVector(
                        embeddingResult,
                        index
                    );

                    if (
                        !values ||
                        values.length !== EMBEDDING_DIMENSIONS
                    ) {
                        throw new Error(
                            `Invalid embedding for ${chunk.id}`
                        );
                    }

                    const metadata = JSON.parse(chunk.metadata ?? "{}");

                    return {
                        id: chunk.id,
                        values,
                        metadata: {
                            document_id: chunk.document_id,
                            document_type: metadata.document_type,
                            section_id: metadata.section_id,
                            source: metadata.source_file ?? metadata.source,
                            doc_type: "policy_document_chunk",
                        },
                    };
                });

                await env.VECTORIZE.upsert(vectors);

                return Response.json({
                    success: true,
                    stage: "vectorize_indexed",
                    vectors_upserted: vectors.length,
                    chunk_ids: chunks.map((chunk) => chunk.id),
                });
            } catch (error) {
                console.error("Vector indexing failed:", error);

                return Response.json(
                    {
                        success: false,
                        error: "Vector indexing failed.",
                    },
                    { status: 500 }
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
                    `INSERT INTO documents (id, content, source)
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
