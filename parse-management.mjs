import fs from "node:fs";
import { extractText } from "unpdf";

const pdf = new Uint8Array(
  fs.readFileSync("./data/optn-management-and-membership-policies.pdf")
);

const { text } = await extractText(pdf, {
  mergePages: true,
});

const lines = text.split("\n").map((line) => line.trim());

const parentTitles = {
  "appendix-K":
    "Transplant Program Inactivity, Withdrawal, and Termination",
};

const sections = [];
let documentType = null;
let documentTitle = null;

for (const line of lines) {
  // Ignore table-of-contents entries.
  if (/\.{5,}\s*\d+\s*$/.test(line)) continue;

  const parent = line.match(
    /^(Policy|Appendix) ([A-M]):\s+(.+)$/
  );

  if (parent && !parent[3].endsWith(".")) {
    documentType = parent[1].toLowerCase();
    documentTitle = parentTitles[`${documentType}-${parent[2]}`] ?? parent[3];
    continue;
  }

  const section = line.match(
    /^([A-M]\.\d+)\s+([A-Z].+)$/
  );

  if (!section || !documentType) continue;

  sections.push({
    id: `${documentType}-${section[1]}`,
    title: section[2],
    parent: documentTitle,
  });
}

console.log("Detected sections:", sections.length);
console.log(sections.slice(0, 15));
console.log("Last sections:", sections.slice(-15));

const ids = sections.map((section) => section.id);

const duplicates = ids.filter(
  (id, index) => ids.indexOf(id) !== index
);

console.log("\nUnique section IDs:", new Set(ids).size);
console.log("Duplicate section IDs:", [...new Set(duplicates)]);
const counts = {};

for (const section of sections) {
  const parentId = section.id.split(".")[0];
  counts[parentId] = (counts[parentId] || 0) + 1;
}

console.log("\nSECTIONS BY PARENT:");
console.table(counts);
const sampleStart = lines.findIndex(
  (line) =>
    line.startsWith(
      "D.4 Quality Assessment and Performance Improvement"
    )
);

console.log("\nSAMPLE SECTION CONTENT:");
console.log(lines.slice(sampleStart, sampleStart + 25).join("\n"));

const start = lines.findIndex((line) =>
  line.startsWith(
    "D.4 Quality Assessment and Performance Improvement"
  )
);

const end = lines.findIndex(
  (line, index) =>
    index > start &&
    line.startsWith("D.5 Facilities and Resources")
);

const sectionText = lines.slice(start, end).join("\n");

console.log("\nD.4 SECTION:");
console.log(sectionText);
console.log("\nCharacters:", sectionText.length);
const shortSections = [];

for (const section of sections) {
const sectionNumber = section.id.split("-")[1];
const heading = `${sectionNumber} ${section.title}`;

  const index = lines.findIndex((line) =>
    line === heading
  );

  if (index === -1) {
    shortSections.push({
      id: section.id,
      issue: "Heading not found exactly",
    });
  }
}

console.log("\nHEADING MATCH CHECK:");
console.log("Unmatched headings:", shortSections.length);
console.table(shortSections);
const repeatedHeadings = [];

for (const section of sections) {
  const sectionNumber = section.id.split("-")[1];
  const heading = `${sectionNumber} ${section.title}`;

  const count = lines.filter((line) => line === heading).length;

  if (count > 1) {
    repeatedHeadings.push({
      id: section.id,
      occurrences: count,
    });
  }
}

console.log("\nREPEATED HEADING CHECK:");
console.log("Repeated headings:", repeatedHeadings.length);
console.table(repeatedHeadings);
const sectionLengths = [];

for (let i = 0; i < sections.length; i++) {
  const section = sections[i];

  const heading =
    `${section.id.split("-")[1]} ${section.title}`;

  const start = lines.findIndex(
    (line) => line === heading
  );

  const nextSection = sections[i + 1];

  const end = nextSection
  ? lines.findIndex(
      (line) =>
        line ===
        `${nextSection.id.split("-")[1]} ${nextSection.title}`
    )
  : lines.findIndex(
      (line) => line === "Appendix M: Definitions"
    );

  const content = lines.slice(start, end).join("\n");

  sectionLengths.push({
    id: section.id,
    characters: content.length,
  });
}

console.log("\nSECTION LENGTH CHECK:");

console.log(
  "Shortest sections:",
  [...sectionLengths]
    .sort((a, b) => a.characters - b.characters)
    .slice(0, 10)
);

console.log(
  "Longest sections:",
  [...sectionLengths]
    .sort((a, b) => b.characters - a.characters)
    .slice(0, 10)
);
const l14Heading = sections.find(
  (section) => section.id === "appendix-L.14"
);

const l14Start = lines.findIndex(
  (line) =>
    line === `L.14 ${l14Heading.title}`
);

console.log("\nEND OF APPENDIX L.14:");
console.log(lines.slice(-35).join("\n"));
console.log("\nAPPENDIX M HEADING CANDIDATES:");

lines.forEach((line, index) => {
  if (/^Appendix M:/.test(line)) {
    console.log({
      index,
      heading: line,
      nextLines: lines.slice(index + 1, index + 4),
    });
  }
});
const l14End = lines.findIndex(
  (line) => line === "Appendix M: Definitions"
);

console.log("\nL.14 BOUNDARY VERIFICATION:");
console.log("L.14 characters:", sectionLengths.find(
  (section) => section.id === "appendix-L.14"
)?.characters);

console.log("Last lines before Appendix M:");
console.log(lines.slice(l14End - 8, l14End).join("\n"));
const appendixMStart = lines.findIndex(
  (line) => line === "Appendix M: Definitions"
);

const appendixMText = lines
  .slice(appendixMStart + 1)
  .join("\n");

console.log("\nAPPENDIX M CHECK:");
console.log("Start index:", appendixMStart);
console.log("Characters:", appendixMText.length);
console.log("First 15 lines:");
console.log(
  lines.slice(appendixMStart + 1, appendixMStart + 16).join("\n")
);
console.log("\nAPPENDIX M STRUCTURE:");

console.log("\nAPPENDIX M STRUCTURE:");

lines
  .slice(appendixMStart + 1, appendixMStart + 65)
  .forEach((line, index) => {
    console.log(`${appendixMStart + 1 + index}: ${line}`);
  });
const alphabetMarkers = [];

for (let i = appendixMStart + 1; i < lines.length; i++) {
  if (/^[A-Z]$/.test(lines[i])) {
    alphabetMarkers.push({
      letter: lines[i],
      line: i,
      nextLine: lines[i + 1],
    });
  }
}

console.log("\nAPPENDIX M ALPHABET MARKERS:");
console.table(alphabetMarkers);
const crossReferences = [];

for (let i = appendixMStart + 1; i < lines.length; i++) {
  const line = lines[i];

  if (/^[^,]{2,100},\s+see\s+/i.test(line)) {
    crossReferences.push({
      line: i,
      text: line,
    });
  }
}

console.log("\nAPPENDIX M CROSS-REFERENCES:");
console.log("Count:", crossReferences.length);
console.table(crossReferences);
const seeAlsoLines = [];

for (let i = appendixMStart + 1; i < lines.length; i++) {
  if (/\bsee also\b/i.test(lines[i])) {
    seeAlsoLines.push({
      line: i,
      text: lines[i],
    });
  }
}

console.log("\nAPPENDIX M SEE ALSO CHECK:");
console.log("Count:", seeAlsoLines.length);
console.table(seeAlsoLines);
console.log("\nAPPENDIX M DEFINITION SAMPLE:");

for (let i = 7455; i <= 7495; i++) {
  console.log(`${i}: ${lines[i]}`);
}
const appendixMFooters = [];

for (let i = appendixMStart + 1; i < lines.length; i++) {
  if (
    lines[i] === "optn.transplant.hrsa.gov" ||
    /^Management and Membership Policies Effective\s*Date:/.test(lines[i])
  ) {
    appendixMFooters.push({
      line: i,
      text: lines[i],
    });
  }
}

console.log("\nAPPENDIX M FOOTER CHECK:");
console.log("Count:", appendixMFooters.length);
console.table(appendixMFooters);
const appendixMCleanLines = lines
  .slice(appendixMStart + 1)
  .filter((line) => {
    if (line === "optn.transplant.hrsa.gov") return false;

    if (
      /^Management and Membership Policies Effective\s*Date:/.test(line)
    ) {
      return false;
    }

    return true;
  });

console.log("\nAPPENDIX M CLEANING CHECK:");
console.log("Original lines:", lines.length - appendixMStart - 1);
console.log("Cleaned lines:", appendixMCleanLines.length);
console.log(
  "Removed lines:",
  lines.length - appendixMStart - 1 - appendixMCleanLines.length
);

console.log("\nPAGE BREAK VERIFICATION:");

const hospitalIndex = appendixMCleanLines.findIndex(
  (line) => line === "Hospital-based Histocompatibility Laboratory"
);

console.log(
  appendixMCleanLines
    .slice(hospitalIndex, hospitalIndex + 9)
    .join("\n")
);
const headingCandidates = [];
const regionTableStart = appendixMCleanLines.findIndex(
  (line) => line.startsWith("Region 1 Connecticut")
);

const regionTableEnd = appendixMCleanLines.findIndex(
  (line) =>
    line ===
    "Secretary of the U.S. Department of Health and Human Services (HHS)"
);
const vcaTableStart = appendixMCleanLines.findIndex(
  (line) => line.startsWith("Covered VCA(s) Type:")
);

const vcaTableEnd = appendixMCleanLines.findIndex(
  (line) => line === "Designated Transplant Program"
);

for (let i = 0; i < appendixMCleanLines.length; i++) {
  const line = appendixMCleanLines[i];
  if (i >= vcaTableStart && i < vcaTableEnd) continue;
  if (i >= regionTableStart && i < regionTableEnd) continue;

  if (/^[A-Z]$/.test(line)) continue;
  if (i === 263 || i === 398) continue;
  if (/^[^,]{2,100},\s+see\s+/i.test(line)) continue;

  if (
    line.length <= 85 &&
    /^[A-Z0-9]/.test(line) &&
    !/[.!?:;]$/.test(line)
  ) {
    headingCandidates.push({
      index: i,
      text: line,
      nextLine: appendixMCleanLines[i + 1],
    });
  }
}
const wrappedHeadingIndex = headingCandidates.findIndex(
  (candidate) => candidate.index === 424
);

if (wrappedHeadingIndex !== -1) {
  headingCandidates[wrappedHeadingIndex].text =
    `${appendixMCleanLines[423]} ${appendixMCleanLines[424]}`;

  headingCandidates[wrappedHeadingIndex].index = 423;
  headingCandidates[wrappedHeadingIndex].nextLine =
    appendixMCleanLines[425];
}
console.log("\nDEBUG WRAPPED HEADING:");
console.log("Found index:", wrappedHeadingIndex);
console.log("Last candidate:", JSON.stringify(headingCandidates.at(-1), null, 2));
console.log("\nGLOSSARY HEADING COUNT:");
console.log("Total heading candidates:", headingCandidates.length);
console.log("Unique heading positions:",
  new Set(headingCandidates.map((candidate) => candidate.index)).size
);
const glossaryEntries = headingCandidates.map((candidate, i) => {
  const nextCandidate = headingCandidates[i + 1];

  const end = nextCandidate
    ? nextCandidate.index
    : appendixMCleanLines.length;

 const definition = appendixMCleanLines
  .slice(candidate.index + (candidate.index === 423 ? 2 : 1), end)
  .filter((line) => !/^[A-Z]$/.test(line))
  .filter((line) => !/^[^,]{2,100},\s+see\s+/i.test(line))
  .join("\n")
  .trim();

  return {
    term: candidate.text,
    definition,
    characters: definition.length,
  };
});
const remainingMarkers = glossaryEntries.filter((entry) =>
  /^[A-Z]$/m.test(entry.definition)
);

console.log("\nCLEANED GLOSSARY MARKER CHECK:");
console.log("Remaining markers:", remainingMarkers.length);
console.log("\nGLOSSARY DEFINITION CHECK:");
console.log("Total entries:", glossaryEntries.length);
console.log(
  "Empty definitions:",
  glossaryEntries.filter((entry) => entry.characters === 0).length
);
console.log(
  "Shortest definitions:",
  [...glossaryEntries]
    .sort((a, b) => a.characters - b.characters)
    .slice(0, 5)
);
const recipientIndex = headingCandidates.findIndex(
  (candidate) => candidate.text === "Recipient"
);

const recipientStart = headingCandidates[recipientIndex].index;
const recipientEnd = headingCandidates[recipientIndex + 1].index;

console.log("\nRECIPIENT DEFINITION CHECK:");
console.log(
  appendixMCleanLines
    .slice(recipientStart, recipientEnd)
    .join("\n")
);
console.log("\nLONGEST GLOSSARY DEFINITIONS:");

console.table(
  [...glossaryEntries]
    .sort((a, b) => b.characters - a.characters)
    .slice(0, 10)
);
console.log("\nGLOSSARY START CHECK:");

console.log(
  "First heading:",
  headingCandidates[0].text
);

console.log(
  "Lines before first heading:",
  headingCandidates[0].index
);
const entriesWithAlphabetMarkers = [];

for (const candidate of headingCandidates) {
  const nextIndex = headingCandidates.indexOf(candidate) + 1;
  const end = headingCandidates[nextIndex]?.index ?? appendixMCleanLines.length;

  const definitionLines = appendixMCleanLines.slice(candidate.index + 1, end);

  const markers = definitionLines.filter((line) =>
    /^[A-Z]$/.test(line)
  );

  if (markers.length > 0) {
    entriesWithAlphabetMarkers.push({
      term: candidate.text,
      markers,
    });
  }
}

console.log("\nALPHABET MARKER CHECK:");
console.log(JSON.stringify(entriesWithAlphabetMarkers, null, 2));
console.log("\nAPPENDIX M HEADING CANDIDATES:");
console.log("Count:", headingCandidates.length);
console.table(headingCandidates.slice(0, 30));
console.log("\nAPPENDIX M VCA TABLE CHECK:");
for (let i = 50; i <= 85; i++) {
  console.log(`${i}: ${appendixMCleanLines[i]}`);
}
console.log("\nAPPENDIX M REMAINING CANDIDATES:");
console.table(headingCandidates.slice(30));
console.log("\nAPPENDIX M REGIONAL TABLE CHECK:");
for (let i = 320; i <= 350; i++) {
  console.log(`${i}: ${appendixMCleanLines[i]}`);
}
console.log("\nAPPENDIX M FINAL ENTRIES CHECK:");
for (let i = 410; i < appendixMCleanLines.length; i++) {
  console.log(`${i}: ${appendixMCleanLines[i]}`);
}
console.log("\nGLOSSARY CROSS-REFERENCE CHECK:");
console.log("Cross-references detected:", crossReferences.length);

for (const ref of crossReferences) {
  console.log(ref.text);
}
const crossReferenceCoverage = crossReferences.map((ref) => {
  const includedIn = glossaryEntries
    .filter((entry) => entry.definition.includes(ref.text))
    .map((entry) => entry.term);

  return {
    reference: ref.text,
    includedIn,
  };
});

console.log("\nCROSS-REFERENCE COVERAGE CHECK:");

for (const item of crossReferenceCoverage) {
  console.log(
    JSON.stringify(item)
  );
}
console.log("\nCROSS-REFERENCE LINE CHECK:");

for (const ref of crossReferences) {
  const index = lines.findIndex((line) => line === ref.text);

  console.log(JSON.stringify({
    reference: ref.text,
    nextLine: lines[index + 1]
  }));
}
const missedSeeReferences = appendixMCleanLines.filter((line) => {
  return (
    /\bsee\b/i.test(line) &&
    !/\bsee also\b/i.test(line) &&
    !/^[^,]{2,100},\s+see\s+/i.test(line)
  );
});

console.log("\nPOSSIBLE MISSED SEE REFERENCES:");
console.log("Count:", missedSeeReferences.length);

for (const line of missedSeeReferences) {
  console.log(JSON.stringify(line));
}
const termCounts = new Map();

for (const entry of glossaryEntries) {
  const key = entry.term.toLowerCase().trim();
  termCounts.set(key, (termCounts.get(key) || 0) + 1);
}

const duplicateTerms = [...termCounts.entries()]
  .filter(([, count]) => count > 1);

console.log("\nDUPLICATE GLOSSARY TERMS:");
console.log("Count:", duplicateTerms.length);
console.log(JSON.stringify(duplicateTerms, null, 2));
const footerContamination = glossaryEntries.filter((entry) =>
  /optn\.transplant\.hrsa\.gov|Management and Membership Policies Effective Date:/i.test(
    entry.definition
  )
);

console.log("\nGLOSSARY FOOTER CHECK:");
console.log("Definitions containing footers:", footerContamination.length);
console.log(footerContamination.map((entry) => entry.term));
console.log("\nFINAL GLOSSARY ENTRY CHECK:");

const lastEntry = glossaryEntries.at(-1);

console.log("Term:", lastEntry.term);
console.log("Definition:");
console.log(lastEntry.definition);
console.log("Characters:", lastEntry.characters);
const headingLeakage = glossaryEntries.filter((entry) =>
  entry.definition.startsWith(entry.term)
);

console.log("\nGLOSSARY HEADING LEAKAGE CHECK:");
console.log("Count:", headingLeakage.length);
console.log(headingLeakage.map((entry) => entry.term));
console.log("\nHEADING LEAKAGE DETAILS:");

for (const entry of headingLeakage) {
  console.log(JSON.stringify({
    term: entry.term,
    definitionStart: entry.definition.slice(0, 250)
  }, null, 2));
}
const veryShortDefinitions = glossaryEntries.filter(
  (entry) => entry.characters < 50
);

console.log("\nVERY SHORT GLOSSARY DEFINITIONS:");
console.log("Count:", veryShortDefinitions.length);
console.log(JSON.stringify(veryShortDefinitions, null, 2));

const managementChunks = [];

const managementHeadings = sections.map((section) => {
  const sectionNumber = section.id.split("-")[1];
  const heading = `${sectionNumber} ${section.title}`;

  return {
    ...section,
    start: lines.findIndex((line) => line === heading)
  };
});

for (let i = 0; i < managementHeadings.length; i++) {
  const section = managementHeadings[i];
  const nextSection = managementHeadings[i + 1];

  const end = nextSection
    ? nextSection.start
    : appendixMStart;

  const content = lines
    .slice(section.start, end)
    .filter((line) =>
      line !== "optn.transplant.hrsa.gov" &&
      !/^Management and Membership Policies Effective\s*Date:/i.test(line)
    )
    .join("\n")
    .trim();

  managementChunks.push({
    id: section.id,
    document: "OPTN Management and Membership Policies",
    parent: section.parent,
    title: section.title,
    content
  });
}

fs.mkdirSync("./output", { recursive: true });

fs.writeFileSync(
  "./output/management-sections.json",
  JSON.stringify(managementChunks, null, 2),
  "utf8"
);

console.log("\nMANAGEMENT CHUNKS CREATED:");
console.log("Count:", managementChunks.length);
console.log("Output: ./output/management-sections.json");

const MAX_CHARS = 2000;
const OVERLAP = 200;
const ragChunks = [];

for (const section of managementChunks) {
  const content = section.content;
  let start = 0;
  let part = 1;

  while (start < content.length) {
    const end = Math.min(start + MAX_CHARS, content.length);

  ragChunks.push({
  id: `${section.id}-chunk-${part}`,
  section_id: section.id,
  document: section.document,
  parent: section.parent,
  title: section.title,
  content: content.slice(start, end)
});

    if (end === content.length) break;

    start = end - OVERLAP;
    part++;
  }
}

fs.writeFileSync(
  "./output/management-rag-chunks.json",
  JSON.stringify(ragChunks, null, 2),
  "utf8"
);

console.log("\nMANAGEMENT RAG CHUNKS CREATED:");
console.log("Count:", ragChunks.length);
console.log("Output: ./output/management-rag-chunks.json");
for (const [index, entry] of glossaryEntries.entries()) {
  ragChunks.push({
    id: `management-glossary-${index + 1}`,
    content: `${entry.term}\n${entry.definition}`,
    metadata: {
      document_type: "management_policy",
      document_title: "OPTN Management and Membership Policies",
      section_id: "Appendix M",
      section_title: entry.term,
      parent: "Definitions",
      effective_date: 20260422,
      source_file: "optn-management-and-membership-policies.pdf",
      content_type: "glossary"
    }
  });
}

fs.writeFileSync(
  "./output/management-rag-chunks.json",
  JSON.stringify(ragChunks, null, 2),
  "utf8"
);

console.log("\nTOTAL MANAGEMENT RAG CHUNKS:", ragChunks.length);

for (const [index, ref] of crossReferences.entries()) {
  ragChunks.push({
    id: `management-crossref-${index + 1}`,
    content: ref.text,
    metadata: {
      document_type: "management_policy",
      document_title: "OPTN Management and Membership Policies",
      section_id: "Appendix M",
      section_title: "Definitions - Cross-reference",
      parent: "Definitions",
      effective_date: 20260422,
      source_file: "optn-management-and-membership-policies.pdf",
      content_type: "cross_reference"
    }
  });
}

fs.writeFileSync(
  "./output/management-rag-chunks.json",
  JSON.stringify(ragChunks, null, 2),
  "utf8"
);

console.log("\nFINAL MANAGEMENT RAG CHUNKS:", ragChunks.length);

