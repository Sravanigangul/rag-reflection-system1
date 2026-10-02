import fs from "node:fs";
import { extractText } from "unpdf";

// ============================================================
// CONFIGURATION
// ============================================================

const PDF_PATH = "./optn_policies.pdf";
const OUTPUT_PATH = "./optn_chunks.json";

const MAX_WORDS = 500;
const OVERLAP_WORDS = 50;


// ============================================================
// 1. LOAD AND EXTRACT PDF
// ============================================================

console.log("\nLoading OPTN policy PDF...");

const pdfBuffer = fs.readFileSync(PDF_PATH);
const pdfBytes = new Uint8Array(pdfBuffer);

const result = await extractText(pdfBytes, {
  mergePages: true,
});

const fullText = result.text;

console.log(
  "Extracted characters:",
  fullText.length
);


// ============================================================
// 2. REMOVE GLOBAL TABLE OF CONTENTS / FRONT MATTER
// ============================================================
//
// Policy 1 appears once in the global contents and then again
// when the actual policy content begins.
//

const policy1Heading =
  "Policy 1: Administrative Rules and Definitions";

const firstPolicy1 =
  fullText.indexOf(policy1Heading);

if (firstPolicy1 === -1) {
  throw new Error(
    "Could not find Policy 1 in extracted PDF."
  );
}

const secondPolicy1 =
  fullText.indexOf(
    policy1Heading,
    firstPolicy1 + policy1Heading.length
  );

if (secondPolicy1 === -1) {
  throw new Error(
    "Could not locate beginning of actual Policy 1."
  );
}

const policyText =
  fullText.slice(secondPolicy1);

console.log(
  "Policy content characters:",
  policyText.length
);


// ============================================================
// 3. PREPARE TEXT LINES
// ============================================================
//
// Keep each PDF line available for structural parsing.
// Normalize repeated spaces conservatively.
//

const lines = policyText
  .split("\n")
  .map(line =>
    line
      .replace(/\s+/g, " ")
      .trim()
  )
  .filter(Boolean);


// ============================================================
// 4. HEADING REGEX
// ============================================================
//
// Policy:
// Policy 8: Allocation of Kidneys
//
// Section:
// 8.2 Kidney Allocation Score
//
// Subsection:
// 8.3.A Waiting Time for Candidates...
//

const policyRegex =
  /^Policy\s+(\d+):\s+(.+)$/;

const sectionRegex =
  /^(\d+\.\d+(?:\.[A-Z])?)\s+(.+)$/;


// ============================================================
// 5. DETECT MINI TABLE-OF-CONTENTS ENTRIES
// ============================================================
//
// Individual policies sometimes contain a small contents list.
//
// Example:
//
// 2.1 OPO Organ Acceptance Criteria 23
// 2.2 OPO Responsibilities 23
//
// The trailing number is the PDF page number.
//
// We do NOT want those entries treated as real sections.
//

function isMiniTocHeading(line) {

  const match =
    line.match(sectionRegex);

  if (!match) {
    return false;
  }

  const title =
    match[2];

  return /\s\d+$/.test(title);
}


// ============================================================
// 6. PARSE DOCUMENT INTO SECTIONS
// ============================================================

const sections = [];

let currentPolicy = null;
let currentSection = null;


// ------------------------------------------------------------
// Helper: save current section
// ------------------------------------------------------------

function saveCurrentSection() {

  if (!currentSection) {
    return;
  }

  const body =
    currentSection.body
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  if (body.length > 0) {

    sections.push({
      ...currentSection,
      body,
    });

  }

  currentSection = null;
}


// ------------------------------------------------------------
// Parse lines
// ------------------------------------------------------------

for (const line of lines) {

  // ==========================================================
  // POLICY HEADING
  // ==========================================================

  const policyMatch = line.match(policyRegex);

  if (policyMatch) {

    const policyNumber = policyMatch[1];

    const policyTitle = policyMatch[2]
      .replace(/\s+\d+$/, "")
      .trim();

    currentPolicy = {
      number: policyNumber,
      title: policyTitle,
    };

    continue;
  }


  // ==========================================================
  // SECTION / SUBSECTION HEADING
  // ==========================================================

  const sectionMatch = line.match(sectionRegex);

  if (sectionMatch) {

    const sectionNumber = sectionMatch[1];

    // --------------------------------------------------------
    // Validate section against current policy
    // --------------------------------------------------------
    //
    // Policy 8:
    //   8.2     -> valid
    //   8.3.A   -> valid
    //
    // But:
    //   0.047 * MAX(...)
    //
    // is part of a mathematical formula, not a section.
    // --------------------------------------------------------

    const belongsToCurrentPolicy =
      currentPolicy &&
      sectionNumber.startsWith(
        `${currentPolicy.number}.`
      );

    if (!belongsToCurrentPolicy) {

      // It matched the numeric regex but is not actually
      // a section belonging to the current policy.
      //
      // Keep it as body text instead of throwing it away.

      if (currentSection) {
        currentSection.body.push(line);
      }

      continue;
    }


    // --------------------------------------------------------
    // Ignore policy mini table-of-contents entries
    // --------------------------------------------------------

    if (isMiniTocHeading(line)) {
      continue;
    }


    // --------------------------------------------------------
    // We found a real section.
    // Save previous section first.
    // --------------------------------------------------------

    saveCurrentSection();


    const sectionTitle =
      sectionMatch[2].trim();

    const isSubsection =
      /\.[A-Z]$/.test(sectionNumber);


    currentSection = {

      policyNumber:
        currentPolicy.number,

      policyTitle:
        currentPolicy.title,

      sectionNumber,

      sectionTitle,

      type:
        isSubsection
          ? "subsection"
          : "section",

      body: [],

    };

    continue;
  }


  // ==========================================================
  // NORMAL BODY TEXT
  // ==========================================================
  //
  // We reach here when the line is neither a policy heading
  // nor a valid section heading.
  //

  if (currentSection) {
    currentSection.body.push(line);
  }
}


// ============================================================
// SAVE FINAL SECTION
// ============================================================

saveCurrentSection();


// ============================================================
// 7. SENTENCE-AWARE CHUNKING
// ============================================================
//
// Priority:
//
// 1. Respect OPTN section boundaries.
// 2. Keep small sections intact.
// 3. Split large sections at sentence boundaries.
// 4. Use word splitting only as fallback.
// 5. Add small overlap between large chunks.
//

function splitIntoChunks(
  text,
  maxWords = MAX_WORDS,
  overlapWords = OVERLAP_WORDS
) {

  const words =
    text.split(/\s+/).filter(Boolean);

  // ----------------------------------------------------------
  // Small section → keep entire section
  // ----------------------------------------------------------

  if (words.length <= maxWords) {
    return [text];
  }


  // ----------------------------------------------------------
  // Try to identify sentences
  // ----------------------------------------------------------

  const sentences =
    text
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map(sentence => sentence.trim())
      .filter(Boolean);


  const chunks = [];

  // Keeps chunk IDs unique if the same section appears more than once
const nextChunkIndexBySection = new Map();

  let currentSentences = [];
  let currentWordCount = 0;


  // ----------------------------------------------------------
  // Process sentences
  // ----------------------------------------------------------

  for (const sentence of sentences) {

    const sentenceWords =
      sentence
        .split(/\s+/)
        .filter(Boolean);

    const sentenceWordCount =
      sentenceWords.length;


    // ========================================================
    // FALLBACK:
    // A single extracted block is larger than maxWords.
    // ========================================================

    if (sentenceWordCount > maxWords) {

      // Save anything accumulated first
      if (currentSentences.length > 0) {

        chunks.push(
          currentSentences.join(" ")
        );

        currentSentences = [];
        currentWordCount = 0;
      }


      // Split oversized block by words
      let start = 0;

      while (start < sentenceWords.length) {

        const end =
          Math.min(
            start + maxWords,
            sentenceWords.length
          );

        const block =
          sentenceWords
            .slice(start, end)
            .join(" ");

        chunks.push(block);

        if (end === sentenceWords.length) {
          break;
        }

        start =
          Math.max(
            end - overlapWords,
            start + 1
          );
      }

      continue;
    }


    // ========================================================
    // CURRENT CHUNK WOULD EXCEED LIMIT
    // ========================================================

    if (
      currentWordCount + sentenceWordCount >
        maxWords &&
      currentSentences.length > 0
    ) {

      const completedChunk =
        currentSentences.join(" ");

      chunks.push(completedChunk);


      // ------------------------------------------------------
      // Build overlap from end of previous chunk
      // ------------------------------------------------------

      const previousWords =
        completedChunk
          .split(/\s+/)
          .filter(Boolean);

      const overlap =
        previousWords
          .slice(-overlapWords)
          .join(" ");


      currentSentences =
        overlap
          ? [overlap, sentence]
          : [sentence];


      currentWordCount =
        (
          overlap
            .split(/\s+/)
            .filter(Boolean)
            .length
        ) +
        sentenceWordCount;

    } else {

      currentSentences.push(sentence);

      currentWordCount +=
        sentenceWordCount;

    }

  }


  // ----------------------------------------------------------
  // Save final chunk
  // ----------------------------------------------------------

  if (currentSentences.length > 0) {

    chunks.push(
      currentSentences.join(" ")
    );

  }


  return chunks;
}


// ============================================================
// 8. CREATE CONTEXTUALIZED CHUNKS
// ============================================================
//
// Every chunk carries its policy + section context.
//
// This contextual header is included in the embedding text.
//

const chunks = [];

// Keeps chunk IDs unique when the same section
// appears more than once in the extracted PDF.
const nextChunkIndexBySection = new Map();

for (const section of sections) {

  const sectionChunks =
    splitIntoChunks(section.body);

  const sectionKey =
   `${section.policyNumber}:${section.sectionNumber}`;

  const startingChunkIndex =
    nextChunkIndexBySection.get(sectionKey) ?? 1;


  sectionChunks.forEach(
    (chunkBody, index) => {

        const chunkIndex =
          startingChunkIndex + index;

      const contextualText =
`OPTN Policy ${section.policyNumber}: ${section.policyTitle}
Section ${section.sectionNumber}: ${section.sectionTitle}

${chunkBody}`;


      chunks.push({

        id:
          `policy-${section.policyNumber}` +
          `-section-${section.sectionNumber}` +
          `-chunk-${chunkIndex}`,

        text:
          contextualText.trim(),

        metadata: {

          policyNumber:
            section.policyNumber,

          policyTitle:
            section.policyTitle,

          sectionNumber:
            section.sectionNumber,

          sectionTitle:
            section.sectionTitle,

          sectionType:
            section.type,

          chunkIndex:
            chunkIndex,

          source:
            "OPTN Policies",

        },

      });

    });

    nextChunkIndexBySection.set(
    sectionKey,
    startingChunkIndex + sectionChunks.length
  );

}


// ============================================================
// 9. VALIDATION
// ============================================================

const invalidChunks =
  chunks.filter(chunk =>

    !chunk.id ||

    !chunk.text ||

    !chunk.metadata.policyNumber ||

    !chunk.metadata.policyTitle ||

    !chunk.metadata.sectionNumber ||

    !chunk.metadata.sectionTitle

  );


const oversizedChunks =
  chunks.filter(chunk => {

    const wordCount =
      chunk.text
        .split(/\s+/)
        .filter(Boolean)
        .length;

    // Context header adds a few words,
    // so allow some headroom.
    return wordCount > MAX_WORDS + 100;

  });


// ============================================================
// 10. SAVE JSON
// ============================================================

fs.writeFileSync(
  OUTPUT_PATH,
  JSON.stringify(
    chunks,
    null,
    2
  ),
  "utf8"
);


// ============================================================
// 11. SUMMARY
// ============================================================

console.log(
  "\n========================================"
);

console.log(
  "CHUNKING COMPLETE"
);

console.log(
  "========================================\n"
);


console.log(
  "Sections parsed:",
  sections.length
);

console.log(
  "Chunks created:",
  chunks.length
);

console.log(
  "Average chunks per section:",
  (
    chunks.length /
    sections.length
  ).toFixed(2)
);

console.log(
  "Invalid chunks:",
  invalidChunks.length
);

console.log(
  "Oversized chunks:",
  oversizedChunks.length
);


// ============================================================
// 12. CHUNK SIZE STATISTICS
// ============================================================

const wordCounts =
  chunks.map(chunk =>
    chunk.text
      .split(/\s+/)
      .filter(Boolean)
      .length
  );


const minWords =
  Math.min(...wordCounts);

const maxWords =
  Math.max(...wordCounts);

const averageWords =
  wordCounts.reduce(
    (sum, count) => sum + count,
    0
  ) / wordCounts.length;


console.log(
  "\n========================================"
);

console.log(
  "CHUNK SIZE STATISTICS"
);

console.log(
  "========================================\n"
);

console.log(
  "Minimum words:",
  minWords
);

console.log(
  "Maximum words:",
  maxWords
);

console.log(
  "Average words:",
  averageWords.toFixed(1)
);


// ============================================================
// 13. FIRST CHUNK
// ============================================================

console.log(
  "\n========================================"
);

console.log(
  "FIRST CHUNK"
);

console.log(
  "========================================\n"
);


console.log(
  JSON.stringify(
    chunks[0],
    null,
    2
  )
);


// ============================================================
// 14. POLICY 8 SAMPLE
// ============================================================

console.log(
  "\n========================================"
);

console.log(
  "POLICY 8 SAMPLE"
);

console.log(
  "========================================\n"
);


const policy8Chunks =
  chunks.filter(
    chunk =>
      chunk.metadata.policyNumber === "8"
  );


policy8Chunks
  .slice(0, 8)
  .forEach(chunk => {

    console.log(
      "\n--------------------------------"
    );

    console.log(
      "ID:",
      chunk.id
    );

    console.log(
      "Section:",
      chunk.metadata.sectionNumber,
      chunk.metadata.sectionTitle
    );


    const words =
      chunk.text
        .split(/\s+/)
        .filter(Boolean)
        .length;


    console.log(
      "Words:",
      words
    );

    console.log(
      "\nPreview:"
    );

    console.log(
      chunk.text.slice(0, 700)
    );

  });


// ============================================================
// 15. SPECIFICALLY INSPECT SECTION 8.2
// ============================================================

console.log(
  "\n========================================"
);

console.log(
  "SECTION 8.2 CHUNKS"
);

console.log(
  "========================================\n"
);


const section82 =
  chunks.filter(
    chunk =>
      chunk.metadata.policyNumber === "8" &&
      chunk.metadata.sectionNumber === "8.2"
  );


section82.forEach(chunk => {

  console.log(
    "\n--------------------------------"
  );

  console.log(
    "ID:",
    chunk.id
  );


  const words =
    chunk.text
      .split(/\s+/)
      .filter(Boolean)
      .length;


  console.log(
    "Words:",
    words
  );

  console.log(
    "\nFULL CHUNK:\n"
  );

  console.log(
    chunk.text
  );

});


// ============================================================
// 16. FINAL STATUS
// ============================================================

console.log(
  "\n========================================"
);

console.log(
  "OUTPUT"
);

console.log(
  "========================================\n"
);

console.log(
  `Saved ${chunks.length} chunks → ${OUTPUT_PATH}`
);