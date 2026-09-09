\# Grounded Healthcare RAG API



A retrieval-augmented generation (RAG) API built with Cloudflare Workers, Workers AI, D1, and Vectorize.



The system stores source documents, creates semantic embeddings, retrieves relevant evidence, and generates answers grounded in the retrieved context. It also refuses unsupported questions when no document meets the similarity threshold.



> Current status: Basic grounded RAG is working. Document chunking, evaluation, and knowledge reflection are planned next.



\## Architecture



```mermaid

flowchart TD

&#x20;   A\[User question] --> B\[Cloudflare Worker]

&#x20;   B --> C\[Workers AI embedding model]

&#x20;   C --> D\[Vectorize semantic search]

&#x20;   D --> E\[Relevant documents]

&#x20;   E --> F\[Gemma generation model]

&#x20;   F --> G\[Grounded answer and sources]



&#x20;   H\[Document ingestion] --> B

&#x20;   B --> I\[D1 source-document storage]

&#x20;   B --> C

&#x20;   C --> D

```



\## Current Features



\- Document ingestion through a REST API

\- Full source-text storage in Cloudflare D1

\- 384-dimensional embeddings using BGE Small

\- Semantic retrieval using Cloudflare Vectorize

\- Cosine-similarity filtering

\- Grounded answer generation using Gemma

\- Sources and similarity scores included in responses

\- Token-usage reporting

\- Input validation and JSON error handling

\- Refusal response when relevant evidence is unavailable



\## Technology Stack



| Technology | Purpose |

|---|---|

| TypeScript | API implementation |

| Cloudflare Workers | Serverless API runtime |

| Workers AI | Embedding and answer-generation models |

| Cloudflare D1 | Original document storage |

| Cloudflare Vectorize | Semantic vector search |

| Wrangler | Local development and deployment |

| Vitest | Testing framework |



\## Models



\### Embedding model



```text

@cf/baai/bge-small-en-v1.5

```



\- Output dimensions: 384

\- Pooling method: `cls`



The same model and pooling method are used for both documents and questions.



\### Generation model



```text

@cf/google/gemma-4-26b-a4b-it

```



The generation model is instructed to answer only from retrieved context and avoid inventing unsupported information.



\## How the System Works



\### Document ingestion



```text

Document

→ input validation

→ complete text stored in D1

→ text converted into an embedding

→ embedding and metadata stored in Vectorize

```



\### Question answering



```text

Question

→ question embedding

→ similarity search

→ threshold filtering

→ relevant evidence added to the prompt

→ grounded answer generated

→ answer, sources, scores and usage returned

```



\## API Endpoints



\### Health check



```http

GET /

```



Example response:



```json

{

&#x20; "message": "My RAG application is running",

&#x20; "status": "ready"

}

```



\### Test embedding generation



```http

GET /test-embedding

```



Confirms that Workers AI returns a 384-dimensional embedding.



\### Ingest a document



```http

POST /ingest

Content-Type: application/json

```



Example request:



```json

{

&#x20; "id": "doc-001",

&#x20; "content": "Retrieval-augmented generation retrieves relevant documents before generating an answer.",

&#x20; "source": "synthetic-test"

}

```



Example response:



```json

{

&#x20; "success": true,

&#x20; "stage": "saved\_to\_d1\_and\_vectorize",

&#x20; "document": {

&#x20;   "id": "doc-001",

&#x20;   "source": "synthetic-test",

&#x20;   "content\_length": 91

&#x20; },

&#x20; "embedding": {

&#x20;   "model": "@cf/baai/bge-small-en-v1.5",

&#x20;   "dimensions": 384

&#x20; }

}

```



\### Search and generate an answer



```http

POST /search

Content-Type: application/json

```



Example request:



```json

{

&#x20; "query": "Which report helps monitor patients returning after discharge?"

}

```



Example response:



```json

{

&#x20; "query": "Which report helps monitor patients returning after discharge?",

&#x20; "answer": "A hospital readmission dashboard helps monitor 30-day returns by combining encounter and discharge data.",

&#x20; "sources": \[

&#x20;   {

&#x20;     "id": "doc-003",

&#x20;     "source": "synthetic-healthcare-test",

&#x20;     "score": 0.7107144,

&#x20;     "content": "A hospital readmission dashboard combines encounter and discharge data to monitor 30-day returns and identify trends by service line."

&#x20;   }

&#x20; ],

&#x20; "model": "@cf/google/gemma-4-26b-a4b-it",

&#x20; "usage": {

&#x20;   "prompt\_tokens": 164,

&#x20;   "completion\_tokens": 21,

&#x20;   "total\_tokens": 185

&#x20; }

}

```



\## Grounding Guardrail



The API currently uses an initial cosine-similarity threshold:



```typescript

const MIN\_SIMILARITY\_SCORE = 0.60;

```



Candidates below this threshold are not supplied to the generation model.



If no documents meet the threshold, the API returns:



```json

{

&#x20; "query": "What is the capital of France?",

&#x20; "answer": "I do not have enough information in the supplied documents to answer this question.",

&#x20; "sources": \[]

}

```



The threshold is an initial development value. It will later be tuned using a larger labeled retrieval-evaluation dataset.



\## Local Setup



\### Prerequisites



\- Node.js

\- npm

\- Cloudflare account

\- Wrangler authentication

\- Cloudflare D1 database

\- Cloudflare Vectorize index



\### Install dependencies



```powershell

npm install

```



\### Generate Cloudflare types



```powershell

npm run cf-typegen

```



\### Apply the database schema



```powershell

npx wrangler d1 execute rag-db --remote --file ".\\migrations\\001\_init.sql"

```



\### Start local development



```powershell

npm run dev

```



The application should become available at:



```text

http://127.0.0.1:8787

```



\## PowerShell Test



```powershell

$body = @{

&#x20;   query = "Which report helps monitor patients returning after discharge?"

} | ConvertTo-Json



Invoke-RestMethod `

&#x20;   -Uri "http://127.0.0.1:8787/search" `

&#x20;   -Method Post `

&#x20;   -ContentType "application/json" `

&#x20;   -Body $body |

&#x20;   ConvertTo-Json -Depth 10

```



\## Initial Retrieval Evaluation



The initial development evaluation used three synthetic documents covering different topics.



| Query topic | Expected top result | Result |

|---|---|---|

| RAG retrieval | `doc-001` | Pass |

| Clinical NLP privacy | `doc-002` | Pass |

| Hospital readmissions | `doc-003` | Pass |

| Unsupported general-knowledge query | No sources | Pass |



This initial test is only a functional check and is not a production-quality evaluation.



\## Current Limitations



\- Only the beginning of each document is currently embedded

\- Proper document chunking is not implemented

\- The evaluation dataset is very small

\- The similarity threshold has not been systematically tuned

\- Retrieval currently uses dense-vector search only

\- No reranking or hybrid keyword search

\- D1 and Vectorize writes are not transactional

\- No authentication or rate limiting

\- No user interface

\- Knowledge reflection is not implemented yet



\## Roadmap



\- \[ ] Add document chunking with overlap

\- \[ ] Retrieve complete source text from D1

\- \[ ] Build a labeled retrieval-evaluation dataset

\- \[ ] Measure top-k accuracy, recall and groundedness

\- \[ ] Tune similarity thresholds

\- \[ ] Add hybrid retrieval and reranking

\- \[ ] Generate verifiable source citations

\- \[ ] Add knowledge reflections

\- \[ ] Consolidate related reflections

\- \[ ] Add automated tests

\- \[ ] Add API authentication and rate limiting

\- \[ ] Build a healthcare-focused user interface

\- \[ ] Add monitoring and observability

\- \[ ] Deploy the Worker



\## Data Safety



The repository uses synthetic healthcare examples only.



Do not upload protected health information, patient identifiers, credentials, API tokens, `.dev.vars`, local Wrangler state, or private institutional data to this public repository.



\## Learning Goal



This project explores how to build and evaluate a grounded AI system rather than relying only on prompt engineering. The focus includes retrieval quality, failure handling, source attribution, evaluation, and production-oriented AI engineering.

