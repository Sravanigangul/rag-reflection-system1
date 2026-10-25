
import fs from "node:fs";
import { extractText } from "unpdf";

const pdf = new Uint8Array(
  fs.readFileSync("./data/optn_bylaws.pdf")
);

const { text } = await extractText(pdf, {
  mergePages: true
});

const lines = text
  .split("\n")
  .map(line => line.trim())
  .filter(Boolean);

console.log("\nOPTN BYLAWS EXTRACTION:");
console.log("Total characters:", text.length);
console.log("Total lines:", lines.length);
console.log("\nFIRST 35 LINES:");
console.log(lines.slice(0, 35).join("\n"));

const articles = [];

for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(
    /^Article (I|II|III|IV|V|VI|VII|VIII|IX):\s+(.+)$/
  );

  if (!match) continue;

  // Skip table-of-contents entries.
  if (/\.{5,}\s*\d+$/.test(lines[i])) continue;

  articles.push({
    id: `article-${match[1]}`,
    title: match[2].trim(),
    start: i
  });
}

console.log("\nBYLAWS ARTICLES:");
console.log("Count:", articles.length);
console.log(JSON.stringify(articles, null, 2));

const bylawsSections = [];

for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(
    /^(\d{1,2}\.\d{1,2})\s+(.+)$/
  );

  if (!match) continue;

  const articleNumber = Number(match[1].split(".")[0]);

  if (articleNumber < 1 || articleNumber > 9) continue;

  const article = articles[articleNumber - 1];
  const nextArticle = articles[articleNumber];

  if (!article || i <= article.start) continue;
  if (nextArticle && i >= nextArticle.start) continue;

  bylawsSections.push({
    id: match[1],
    title: match[2].trim(),
    article: article.id,
    article_title: article.title,
    start: i
  });
}

console.log("\nBYLAWS NUMBERED SECTIONS:");
console.log("Count:", bylawsSections.length);
console.log(JSON.stringify(bylawsSections, null, 2));

const MAX_CHARS = 2000;
const OVERLAP = 200;
const bylawsChunks = [];

for (let a = 0; a < articles.length; a++) {
  const article = articles[a];
  const articleEnd = articles[a + 1]?.start ?? lines.length;

  const articleSections = bylawsSections.filter(
    (section) => section.article === article.id
  );

  const boundaries = [
    { id: article.id, title: article.title, start: article.start },
    ...articleSections
  ];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const end = boundaries[i + 1]?.start ?? articleEnd;

    const content = lines
      .slice(boundary.start, end)
      .filter((line) => line !== ".")
      .join("\n")
      .trim();

    if (!content) continue;

    let start = 0;
    let part = 1;

    while (start < content.length) {
      const chunkEnd = Math.min(start + MAX_CHARS, content.length);

      bylawsChunks.push({
        id: `bylaws-${boundary.id}-chunk-${part}`,
        content: content.slice(start, chunkEnd),
        metadata: {
          document_type: "invest_bylaws",
          document_title: "Bylaws of Independent Network of Volunteers for Equitable and Safe Transplants Inc.",
          article_id: article.id,
          article_title: article.title,
          section_id: boundary.id,
          section_title: boundary.title,
          effective_date: 20241202,
          source_file: "optn_bylaws.pdf"
        }
      });

      if (chunkEnd === content.length) break;

      start = chunkEnd - OVERLAP;
      part++;
    }
  }
}

fs.mkdirSync("./output", { recursive: true });

fs.writeFileSync(
  "./output/bylaws-rag-chunks.json",
  JSON.stringify(bylawsChunks, null, 2),
  "utf8"
);

console.log("\nBYLAWS RAG CHUNKS CREATED:");
console.log("Count:", bylawsChunks.length);
console.log("Output: ./output/bylaws-rag-chunks.json");
