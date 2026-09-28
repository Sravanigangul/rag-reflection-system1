import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker, {
    chunkDocument,
    reciprocalRankFusion,
	extractCitationNumbers,
	validateCitationNumbers,
} from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("RAG worker", () => {
	it("returns ready status from the home route (unit style)", async () => {
		const request = new IncomingRequest("http://example.com/");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);

		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);

		expect(await response.json()).toEqual({
			message: "My RAG application is running",
			status: "ready",
		});
	});

	it("returns ready status from the home route (integration style)", async () => {
		const response = await SELF.fetch("https://example.com/");

		expect(response.status).toBe(200);

		expect(await response.json()).toEqual({
			message: "My RAG application is running",
			status: "ready",
		});
	});

	it("returns 404 for an unknown route", async () => {
		const response = await SELF.fetch(
			"https://example.com/unknown",
		);

		expect(response.status).toBe(404);

		expect(await response.json()).toEqual({
			error: "Route not found",
		});
	});
});

describe("Document chunking", () => {
	it("splits a document into overlapping chunks", () => {
		const content = "A".repeat(2500);

		const chunks = chunkDocument(
			content,
			1000,
			200,
		);

		expect(chunks).toHaveLength(3);

		expect(chunks[0]).toEqual({
			content: "A".repeat(1000),
			startChar: 0,
			endChar: 1000,
		});

		expect(chunks[1]).toEqual({
			content: "A".repeat(1000),
			startChar: 800,
			endChar: 1800,
		});

		expect(chunks[2]).toEqual({
			content: "A".repeat(900),
			startChar: 1600,
			endChar: 2500,
		});
	});
});

it("prefers natural sentence boundaries", () => {
    const text =
        "The patient has hypertension. " +
        "Metformin was prescribed for diabetes. " +
        "Blood pressure improved after treatment. " +
        "Follow-up was scheduled for next month.";

    const chunks = chunkDocument(
        text,
        80,
        20,
    );

    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(80);

        expect(
            chunk.content.startsWith(" "),
        ).toBe(false);

        expect(
            chunk.content.endsWith(" "),
        ).toBe(false);
    }

    expect(
        chunks.some((chunk) =>
            chunk.content.endsWith("."),
        ),
    ).toBe(true);
});

describe("Reciprocal Rank Fusion", () => {
    it("rewards results that rank highly in both retrievers", () => {
        const semanticResults = [
            { id: "chunk-C" },
            { id: "chunk-A" },
            { id: "chunk-D" },
        ];

        const lexicalResults = [
            { id: "chunk-A" },
            { id: "chunk-C" },
            { id: "chunk-B" },
        ];

        const fused = reciprocalRankFusion(
            semanticResults,
            lexicalResults,
        );

        expect(fused[0].id).toBe("chunk-C");
        expect(fused[1].id).toBe("chunk-A");

        expect(
            fused.find(
                (result) => result.id === "chunk-C",
            )?.rrfScore,
        ).toBeGreaterThan(
            fused.find(
                (result) => result.id === "chunk-D",
            )?.rrfScore ?? 0,
        );
    });
});

describe("Citation extraction", () => {
    it("extracts unique source numbers from an answer", () => {
        const answer =
            "RAG uses retrieved context [Source 1]. " +
            "Another claim is supported by [Source 2, Source 3]. " +
            "Source 1 also supports this statement.";

        expect(
            extractCitationNumbers(answer)
        ).toEqual([1, 2, 3]);
    });
});

describe("Citation validation", () => {
    it("removes citations that do not correspond to retrieved sources", () => {
        const citationNumbers = [1, 3, 8];

        const validCitations =
            validateCitationNumbers(
                citationNumbers,
                5,
            );

        expect(validCitations).toEqual([1, 3]);
    });
});