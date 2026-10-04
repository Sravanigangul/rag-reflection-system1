import fs from "node:fs/promises";

const ENDPOINT =
    "https://rag-reflection-system.gangulasravani1.workers.dev/search";

const cases = JSON.parse(
    await fs.readFile(
        new URL(
            "./retrieval-benchmark.json",
            import.meta.url,
        ),
        "utf8",
    ),
);

/*
 * Extract the OPTN section number from either:
 *
 *   policy-8-section-8.4.E-chunk-1
 *
 * or from chunk content containing:
 *
 *   Section 8.4.E:
 */
function extractSection(source) {
    const id = source.id ?? "";
    const content = source.content ?? "";

    const idMatch = id.match(
        /-section-(.+?)-chunk-/i,
    );

    if (idMatch) {
        return idMatch[1];
    }

    const contentMatch = content.match(
        /Section\s+([0-9]+(?:\.[0-9A-Za-z]+)*)/i,
    );

    return contentMatch
        ? contentMatch[1]
        : null;
}

/*
 * Convert returned chunks into a ranked list
 * of UNIQUE policy sections.
 *
 * This prevents several chunks from the same
 * long section from artificially dominating
 * section-level retrieval metrics.
 */
function getRankedSections(response) {
    const sections = [];

    for (const source of response.sources ?? []) {
        const section =
            extractSection(source);

        if (
            section &&
            !sections.includes(section)
        ) {
            sections.push(section);
        }
    }

    return sections;
}

function isAbstention(response) {
    const answer =
        response.answer
            ?.replace(/\s+/g, " ")
            .trim() ?? "";

    return (
        response.retryAssessment
            ?.sufficient === false ||
        /do not have enough information|does not contain|not provided|cannot determine|cannot answer/i.test(
            answer,
        )
    );
}

function calculateAnswerableMetrics(
    testCase,
    response,
) {
    const relevant =
        testCase.relevantSections;

    const rankedSections =
        getRankedSections(response);

    const atK = (k) =>
        rankedSections.slice(0, k);

    const relevantInTopK = (k) => {
        const retrieved =
            new Set(atK(k));

        return relevant.filter(
            (section) =>
                retrieved.has(section),
        );
    };

    const recallAt = (k) =>
        relevant.length === 0
            ? null
            : relevantInTopK(k).length /
              relevant.length;

    const hitAt = (k) =>
        relevantInTopK(k).length > 0
            ? 1
            : 0;

    let reciprocalRank = 0;
    let firstRelevantRank = null;

    for (
        let i = 0;
        i < rankedSections.length;
        i++
    ) {
        if (
            relevant.includes(
                rankedSections[i],
            )
        ) {
            firstRelevantRank = i + 1;
            reciprocalRank =
                1 / firstRelevantRank;
            break;
        }
    }

    return {
        rankedSections,
        recallAt1: recallAt(1),
        recallAt3: recallAt(3),
        recallAt5: recallAt(5),
        hitAt1: hitAt(1),
        hitAt3: hitAt(3),
        hitAt5: hitAt(5),
        firstRelevantRank,
        reciprocalRank,
    };
}

function average(values) {
    const valid = values.filter(
        (value) =>
            typeof value === "number" &&
            Number.isFinite(value),
    );

    if (!valid.length) {
        return null;
    }

    return (
        valid.reduce(
            (sum, value) => sum + value,
            0,
        ) / valid.length
    );
}

function percentage(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "N/A";
    }

    return `${(value * 100).toFixed(1)}%`;
}

const results = [];

for (const testCase of cases) {
    console.log(
        `\nRunning: ${testCase.id}`,
    );

    try {
        const httpResponse = await fetch(
            ENDPOINT,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",
                },
                body: JSON.stringify({
                    query: testCase.query,
                }),
            },
        );

        const response =
            await httpResponse.json();

        if (!httpResponse.ok) {
            results.push({
                id: testCase.id,
                category:
                    testCase.category,
                difficulty:
                    testCase.difficulty,
                shouldAnswer:
                    testCase.shouldAnswer,
                error:
                    response.error ??
                    `HTTP ${httpResponse.status}`,
            });

            console.log("  ERROR");
            continue;
        }

        const abstained =
            isAbstention(response);

        const baseResult = {
            id: testCase.id,
            category:
                testCase.category,
            difficulty:
                testCase.difficulty,
            query: testCase.query,
            relevantSections:
                testCase.relevantSections,
            shouldAnswer:
                testCase.shouldAnswer,
            abstained,
            retrievalRetried:
                response.retrievalRetried ??
                false,
            reflectionSupported:
                response.reflection
                    ?.supported ?? null,
        };

        if (testCase.shouldAnswer) {
            const metrics =
                calculateAnswerableMetrics(
                    testCase,
                    response,
                );

            results.push({
                ...baseResult,
                ...metrics,
                answerBehaviorMatch:
                    !abstained,
            });

            console.log(
                `  Sections: ${metrics.rankedSections.join(", ") || "none"}`,
            );

            console.log(
                `  Recall@5: ${metrics.recallAt5}`,
            );

            console.log(
                `  First relevant rank: ${metrics.firstRelevantRank ?? "none"}`,
            );

            console.log(
                `  Retried: ${baseResult.retrievalRetried}`,
            );
        } else {
            const rankedSections =
                getRankedSections(response);

            results.push({
                ...baseResult,
                rankedSections,
                answerBehaviorMatch:
                    abstained,
            });

            console.log(
                `  Abstained: ${abstained}`,
            );

            console.log(
                `  Retried: ${baseResult.retrievalRetried}`,
            );
        }
    } catch (error) {
        results.push({
            id: testCase.id,
            category:
                testCase.category,
            difficulty:
                testCase.difficulty,
            shouldAnswer:
                testCase.shouldAnswer,
            error:
                error instanceof Error
                    ? error.message
                    : String(error),
        });

        console.log("  ERROR");
    }
}

/*
 * Only successful HTTP/evaluation runs should
 * contribute to aggregate metrics.
 */
const successful =
    results.filter(
        (result) => !result.error,
    );

const answerable =
    successful.filter(
        (result) =>
            result.shouldAnswer,
    );

const unsupported =
    successful.filter(
        (result) =>
            !result.shouldAnswer,
    );

const retried =
    successful.filter(
        (result) =>
            result.retrievalRetried,
    );

const retriedAnswerable =
    answerable.filter(
        (result) =>
            result.retrievalRetried,
    );

/*
 * Practical recovery proxy:
 *
 * Among answerable queries that triggered retry,
 * how often did the final evidence contain at
 * least one relevant section AND the system answer?
 *
 * This is not a pure "initial miss recovered"
 * metric because the endpoint does not expose
 * initial ranked sources separately.
 */
const recoveredAnswerable =
    retriedAnswerable.filter(
        (result) =>
            result.hitAt5 === 1 &&
            !result.abstained,
    );

const summary = {
    totalCases: cases.length,
    successfulCases:
        successful.length,
    errors:
        results.filter(
            (result) => result.error,
        ).length,

    answerableCases:
        answerable.length,
    unsupportedCases:
        unsupported.length,

    recallAt1: average(
        answerable.map(
            (result) =>
                result.recallAt1,
        ),
    ),

    recallAt3: average(
        answerable.map(
            (result) =>
                result.recallAt3,
        ),
    ),

    recallAt5: average(
        answerable.map(
            (result) =>
                result.recallAt5,
        ),
    ),

    hitAt1: average(
        answerable.map(
            (result) =>
                result.hitAt1,
        ),
    ),

    hitAt3: average(
        answerable.map(
            (result) =>
                result.hitAt3,
        ),
    ),

    hitAt5: average(
        answerable.map(
            (result) =>
                result.hitAt5,
        ),
    ),

    mrr: average(
        answerable.map(
            (result) =>
                result.reciprocalRank,
        ),
    ),

    answerRate: average(
        answerable.map(
            (result) =>
                result.abstained
                    ? 0
                    : 1,
        ),
    ),

    abstentionAccuracy: average(
        unsupported.map(
            (result) =>
                result.abstained
                    ? 1
                    : 0,
        ),
    ),

    retryRate:
        successful.length
            ? retried.length /
              successful.length
            : null,

    answerableRetryRate:
        answerable.length
            ? retriedAnswerable.length /
              answerable.length
            : null,

    retryRecoveryProxy:
        retriedAnswerable.length
            ? recoveredAnswerable.length /
              retriedAnswerable.length
            : null,
};

console.log(
    "\n======================================",
);
console.log(
    "POLICYLENS RETRIEVAL BENCHMARK",
);
console.log(
    "======================================\n",
);

console.log(
    `Cases:                ${summary.successfulCases}/${summary.totalCases}`,
);

console.log(
    `Errors:               ${summary.errors}`,
);

console.log(
    `Answerable:           ${summary.answerableCases}`,
);

console.log(
    `Unsupported:          ${summary.unsupportedCases}`,
);

console.log("");

console.log(
    `Recall@1:             ${percentage(summary.recallAt1)}`,
);

console.log(
    `Recall@3:             ${percentage(summary.recallAt3)}`,
);

console.log(
    `Recall@5:             ${percentage(summary.recallAt5)}`,
);

console.log("");

console.log(
    `Hit Rate@1:           ${percentage(summary.hitAt1)}`,
);

console.log(
    `Hit Rate@3:           ${percentage(summary.hitAt3)}`,
);

console.log(
    `Hit Rate@5:           ${percentage(summary.hitAt5)}`,
);

console.log("");

console.log(
    `MRR:                  ${
        summary.mrr === null
            ? "N/A"
            : summary.mrr.toFixed(3)
    }`,
);

console.log(
    `Answer rate:          ${percentage(summary.answerRate)}`,
);

console.log(
    `Abstention accuracy:  ${percentage(summary.abstentionAccuracy)}`,
);

console.log(
    `Retry rate:           ${percentage(summary.retryRate)}`,
);

console.log(
    `Answerable retry:     ${percentage(summary.answerableRetryRate)}`,
);

console.log(
    `Retry recovery proxy: ${percentage(summary.retryRecoveryProxy)}`,
);

console.log(
    "\n======================================\n",
);

console.table(
    results.map((result) => ({
        id: result.id,
        difficulty:
            result.difficulty ?? "",
        R1:
            result.recallAt1 ??
            "N/A",
        R3:
            result.recallAt3 ??
            "N/A",
        R5:
            result.recallAt5 ??
            "N/A",
        rank:
            result.firstRelevantRank ??
            "N/A",
        retried:
            result.retrievalRetried ??
            "N/A",
        abstained:
            result.abstained ??
            "N/A",
        error:
            result.error ?? "",
    })),
);

await fs.writeFile(
    new URL(
        "./retrieval-eval-results.json",
        import.meta.url,
    ),
    JSON.stringify(
        {
            summary,
            results,
        },
        null,
        2,
    ),
);

console.log(
    "Detailed results saved to eval/retrieval-eval-results.json",
);