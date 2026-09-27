import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

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