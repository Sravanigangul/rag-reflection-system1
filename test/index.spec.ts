import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker, { chunkDocument } from "../src/index";

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