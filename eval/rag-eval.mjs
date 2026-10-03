import fs from "node:fs/promises";

const ENDPOINT =
    "https://rag-reflection-system.gangulasravani1.workers.dev/search";

const cases = JSON.parse(
    await fs.readFile(
        new URL("./eval-cases.json", import.meta.url),
        "utf8",
    ),
);

function sectionMatched(testCase, response) {
    if (!testCase.expectedSections?.length) {
        return null;
    }

    const sourceText = (response.sources ?? [])
        .map((source) =>
            `${source.id ?? ""}\n${source.content ?? ""}`,
        )
        .join("\n");

    return testCase.expectedSections.some(
        (section) =>
            sourceText.includes(
                `Section ${section}`,
            ) ||
            sourceText.includes(
                `section-${section}`,
            ),
    );
}

function evaluateCase(testCase, response) {
    const sectionMatch =
        sectionMatched(testCase, response);

    const reflectionSupported =
        response.reflection?.supported ?? null;

    const retried =
        response.retrievalRetried ?? false;
    const answer =
    response.answer?.replace(
        /\s+/g,
        " ",
    ) ?? "";

const abstained =
    /do not have enough information|does not contain|not provided|cannot determine|cannot answer/i.test(
        answer,
    );

const answerBehaviorMatch =
    testCase.shouldAnswer
        ? !abstained
        : abstained;

    let retryMatch = null;

    if (
        typeof testCase.expectRetry ===
        "boolean"
    ) {
        retryMatch =
            retried === testCase.expectRetry;
    }

    return {
        id: testCase.id,
        category: testCase.category,
        expectedSections:
            testCase.expectedSections.join(", "),
        sectionMatch,
        retrievalRetried: retried,
        retryMatch,
        reflectionSupported,
        answer,
        abstained,
        answerBehaviorMatch,
    };
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
                error:
                    response.error ??
                    `HTTP ${httpResponse.status}`,
            });

            console.log("  ERROR");
            continue;
        }

        const result =
            evaluateCase(
                testCase,
                response,
            );

        results.push(result);

        console.log(
            `  Section match: ${result.sectionMatch}`,
        );
        console.log(
            `  Retried: ${result.retrievalRetried}`,
        );
        console.log(
            `  Reflection supported: ${result.reflectionSupported}`,
        );
    } catch (error) {
        results.push({
            id: testCase.id,
            category: testCase.category,
            error:
                error instanceof Error
                    ? error.message
                    : String(error),
        });

        console.log("  ERROR");
    }
}

console.log("\n============================");
console.log("RAG EVALUATION RESULTS");
console.log("============================\n");

console.table(
    results.map((result) => ({
        id: result.id,
        sectionMatch:
            result.sectionMatch ?? "N/A",
        retried:
            result.retrievalRetried ?? "N/A",
        reflection:
            result.reflectionSupported ??
            "N/A",
        error: result.error ?? "",
        answerBehavior:
            result.answerBehaviorMatch ?? "N/A",
    })),
);

await fs.writeFile(
    new URL(
        "./eval-results.json",
        import.meta.url,
    ),
    JSON.stringify(results, null, 2),
);

console.log(
    "\nDetailed results saved to eval/eval-results.json",
);