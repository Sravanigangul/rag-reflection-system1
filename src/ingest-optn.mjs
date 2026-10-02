import fs from "node:fs/promises";

const CHUNKS_FILE = "./optn_chunks.json";

const INGEST_URL =
    "https://rag-reflection-system.gangulasravani1.workers.dev/ingest-chunks";

// Keep batches small so Workers AI, D1, and Vectorize
// are not asked to process all 530 chunks at once.
const BATCH_SIZE = 10;

async function main() {
    console.log("Reading OPTN chunks...");

    const raw = await fs.readFile(CHUNKS_FILE, "utf8");
    const chunks = JSON.parse(raw);

    if (!Array.isArray(chunks)) {
        throw new Error(
            "optn_chunks.json must contain a JSON array.",
        );
    }

    console.log(`Found ${chunks.length} chunks.`);

    let uploaded = 0;

    for (
        let start = 0;
        start < chunks.length;
        start += BATCH_SIZE
    ) {
        const batch = chunks.slice(
            start,
            start + BATCH_SIZE,
        );

        const batchNumber =
            Math.floor(start / BATCH_SIZE) + 1;

        const totalBatches =
            Math.ceil(chunks.length / BATCH_SIZE);

        console.log(
            `Uploading batch ${batchNumber}/${totalBatches} (${batch.length} chunks)...`,
        );

        const response = await fetch(INGEST_URL, {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
            },

            body: JSON.stringify({
                chunks: batch,
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error(
                `Batch ${batchNumber} failed:`,
                result,
            );

            throw new Error(
                `Upload stopped at batch ${batchNumber}.`,
            );
        }

        uploaded += batch.length;

        console.log(
            `✓ Batch ${batchNumber} complete — ${uploaded}/${chunks.length} chunks uploaded`,
        );

        // Small pause between requests.
        await new Promise((resolve) =>
            setTimeout(resolve, 300),
        );
    }

    console.log("");
    console.log("==============================");
    console.log("OPTN INGESTION COMPLETE");
    console.log("==============================");
    console.log(`Total chunks: ${chunks.length}`);
    console.log(`Uploaded:     ${uploaded}`);
}

main().catch((error) => {
    console.error("");
    console.error("INGESTION FAILED");
    console.error(error);

    process.exit(1);
});