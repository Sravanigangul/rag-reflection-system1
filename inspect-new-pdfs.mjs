import fs from "node:fs";
import { extractText } from "unpdf";

const bytes = new Uint8Array(
  fs.readFileSync("./data/optn-management-and-membership-policies.pdf")
);

const result = await extractText(bytes, {
  mergePages: true,
});

const lines = result.text
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const headings = lines.filter((line) =>
  /^[A-M]\.\d+(?:\.[a-zA-Z0-9]+)*\s+\S/.test(line)
);

console.log("NUMBERED HEADING CANDIDATES:", headings.length);
console.log("\nLAST 35 HEADING CANDIDATES:");
console.log(headings.slice(-35).join("\n"));