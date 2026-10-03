export const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta
    name="description"
    content="Evidence-grounded OPTN policy intelligence with self-correcting retrieval."
/>
<title>PolicyLens | OPTN Policy Intelligence</title>

<style>
    :root {
        --bg: #f6f8fb;
        --surface: #ffffff;
        --surface-soft: #f8fafc;
        --text: #172033;
        --muted: #667085;
        --border: #e4e8ef;
        --primary: #3457d5;
        --primary-dark: #2946b0;
        --primary-soft: #eef2ff;
        --success: #157347;
        --success-bg: #ecf8f1;
        --warning: #9a6700;
        --warning-bg: #fff8e6;
        --danger: #b42318;
        --danger-bg: #fff1f0;
        --shadow: 0 16px 40px rgba(30, 41, 59, 0.08);
        --radius: 18px;
    }

    * {
        box-sizing: border-box;
    }

    html {
        scroll-behavior: smooth;
    }

    body {
        margin: 0;
        min-height: 100vh;
        background:
            radial-gradient(
                circle at top left,
                rgba(52, 87, 213, 0.08),
                transparent 28rem
            ),
            var(--bg);
        color: var(--text);
        font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
    }

    button,
    textarea {
        font: inherit;
    }

    .shell {
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
    }

    header {
        padding: 28px 0 18px;
    }

    .nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 750;
        letter-spacing: -0.02em;
    }

    .brand-mark {
        display: grid;
        width: 40px;
        height: 40px;
        place-items: center;
        border-radius: 12px;
        background: var(--primary);
        color: white;
        font-size: 18px;
        box-shadow: 0 8px 22px rgba(52, 87, 213, 0.22);
    }

    .brand-title {
        font-size: 18px;
    }

    .brand-subtitle {
        margin-top: 1px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 500;
    }

    .nav-badge {
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.75);
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
    }

    .hero {
        padding: 52px 0 34px;
        text-align: center;
    }

    .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 18px;
        padding: 7px 12px;
        border: 1px solid #dce3ff;
        border-radius: 999px;
        background: var(--primary-soft);
        color: var(--primary-dark);
        font-size: 12px;
        font-weight: 700;
    }

    .eyebrow-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--primary);
    }

    h1 {
        max-width: 760px;
        margin: 0 auto;
        font-size: clamp(38px, 6vw, 64px);
        line-height: 1.02;
        letter-spacing: -0.055em;
    }

    .hero-description {
        max-width: 680px;
        margin: 20px auto 0;
        color: var(--muted);
        font-size: 17px;
        line-height: 1.7;
    }

    .search-card {
        max-width: 820px;
        margin: 36px auto 0;
        padding: 8px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: var(--surface);
        box-shadow: var(--shadow);
    }

    .input-wrap {
        position: relative;
    }

    textarea {
        display: block;
        width: 100%;
        min-height: 124px;
        padding: 20px 20px 64px;
        resize: vertical;
        border: 0;
        outline: 0;
        background: transparent;
        color: var(--text);
        font-size: 16px;
        line-height: 1.55;
    }

    textarea::placeholder {
        color: #98a2b3;
    }

    .ask-row {
        position: absolute;
        right: 12px;
        bottom: 12px;
        left: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .hint {
        padding-left: 7px;
        color: #98a2b3;
        font-size: 12px;
    }

    .ask-button {
        display: inline-flex;
        min-width: 138px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 18px;
        border: 0;
        border-radius: 12px;
        background: var(--primary);
        color: white;
        cursor: pointer;
        font-weight: 700;
        transition: 160ms ease;
    }

    .ask-button:hover {
        background: var(--primary-dark);
        transform: translateY(-1px);
    }

    .ask-button:disabled {
        cursor: wait;
        opacity: 0.65;
        transform: none;
    }

    .suggestions {
        display: flex;
        max-width: 820px;
        margin: 17px auto 0;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
    }

    .suggestion {
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.72);
        color: var(--muted);
        cursor: pointer;
        font-size: 12px;
        transition: 150ms ease;
    }

    .suggestion:hover {
        border-color: #c8d2f8;
        background: var(--primary-soft);
        color: var(--primary-dark);
    }

    .workspace {
        display: none;
        padding: 20px 0 70px;
    }

    .workspace.visible {
        display: block;
    }

    .answer-card,
    .trace-card,
    .evidence-section {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        box-shadow: 0 8px 24px rgba(30, 41, 59, 0.045);
    }

    .answer-card {
        padding: 28px;
    }

    .section-label {
        display: flex;
        align-items: center;
        gap: 9px;
        margin-bottom: 16px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
    }

    .answer {
        font-size: 16px;
        line-height: 1.78;
        white-space: pre-wrap;
    }

    .citation-link {
        display: inline-flex;
        margin: 0 3px;
        padding: 3px 7px;
        border: 0;
        border-radius: 7px;
        background: var(--primary-soft);
        color: var(--primary);
        cursor: pointer;
        font-size: 12px;
        font-weight: 750;
        vertical-align: middle;
    }

    .citation-link:hover {
        background: #dfe6ff;
    }

    .verification {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 22px;
        padding: 9px 12px;
        border-radius: 10px;
        background: var(--success-bg);
        color: var(--success);
        font-size: 13px;
        font-weight: 700;
    }

    .verification.warning {
        background: var(--warning-bg);
        color: var(--warning);
    }

    .verification.error {
        background: var(--danger-bg);
        color: var(--danger);
    }

    .grid {
        display: grid;
        grid-template-columns: 0.9fr 1.1fr;
        gap: 18px;
        margin-top: 18px;
    }

    .trace-card,
    .evidence-section {
        padding: 24px;
    }

    .trace-step {
        position: relative;
        display: flex;
        gap: 12px;
        padding-bottom: 20px;
    }

    .trace-step:last-child {
        padding-bottom: 0;
    }

    .trace-step:not(:last-child)::after {
        position: absolute;
        top: 25px;
        bottom: 2px;
        left: 11px;
        width: 1px;
        background: var(--border);
        content: "";
    }

    .trace-icon {
        z-index: 1;
        display: grid;
        width: 23px;
        height: 23px;
        flex: 0 0 23px;
        place-items: center;
        border-radius: 50%;
        background: var(--primary-soft);
        color: var(--primary);
        font-size: 11px;
        font-weight: 800;
    }

    .trace-icon.success {
        background: var(--success-bg);
        color: var(--success);
    }

    .trace-icon.warning {
        background: var(--warning-bg);
        color: var(--warning);
    }

    .trace-title {
        font-size: 13px;
        font-weight: 750;
    }

    .trace-detail {
        margin-top: 3px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
        word-break: break-word;
    }

    .evidence-list {
        display: grid;
        gap: 11px;
    }

    .evidence-card {
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 13px;
        background: var(--surface-soft);
        transition:
            border-color 150ms ease,
            box-shadow 150ms ease;
    }

    .evidence-card.cited {
        border-color: #cfd8ff;
        background: #fbfcff;
        box-shadow: inset 3px 0 0 var(--primary);
    }

    .evidence-header {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 15px;
        border: 0;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        text-align: left;
    }

    .source-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 7px;
        margin-bottom: 4px;
        color: var(--primary);
        font-size: 11px;
        font-weight: 750;
    }

    .cited-badge {
        padding: 3px 6px;
        border-radius: 999px;
        background: var(--success-bg);
        color: var(--success);
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .evidence-title {
        font-size: 13px;
        font-weight: 750;
    }

    .evidence-source {
        margin-top: 4px;
        color: var(--muted);
        font-size: 11px;
    }

    .evidence-arrow {
        color: var(--muted);
        transition: transform 150ms ease;
    }

    .evidence-card.open .evidence-arrow {
        transform: rotate(180deg);
    }

    .evidence-content {
        display: none;
        padding: 0 15px 15px;
        color: #475467;
        font-size: 12px;
        line-height: 1.65;
        white-space: pre-wrap;
    }

    .evidence-card.open .evidence-content {
        display: block;
    }

    .evidence-group-title {
        margin: 2px 0 9px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 750;
    }

    .other-evidence {
        margin-top: 14px;
    }

    .other-evidence > summary {
        padding: 10px 2px;
        color: var(--muted);
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        list-style-position: inside;
    }

    .other-evidence-list {
        display: grid;
        gap: 10px;
        margin-top: 8px;
    }

    .evidence-note {
        margin-bottom: 14px;
        padding: 12px 14px;
        border: 1px solid #f5df9a;
        border-radius: 11px;
        background: var(--warning-bg);
        color: #805b10;
        font-size: 12px;
        line-height: 1.55;
    }

    .empty-evidence {
        padding: 20px;
        border: 1px dashed var(--border);
        border-radius: 12px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.6;
        text-align: center;
    }

    .loading-card {
        display: none;
        max-width: 820px;
        margin: 10px auto 60px;
        padding: 24px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        box-shadow: var(--shadow);
    }

    .loading-card.visible {
        display: block;
    }

    .loading-line {
        height: 12px;
        margin: 11px 0;
        overflow: hidden;
        border-radius: 999px;
        background: #edf0f5;
    }

    .loading-line::after {
        display: block;
        width: 45%;
        height: 100%;
        background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.9),
            transparent
        );
        content: "";
        animation: shimmer 1.15s infinite;
    }

    .loading-line.short {
        width: 58%;
    }

    @keyframes shimmer {
        from {
            transform: translateX(-100%);
        }

        to {
            transform: translateX(250%);
        }
    }

    .error-box {
        padding: 18px;
        border: 1px solid #fecdca;
        border-radius: 14px;
        background: var(--danger-bg);
        color: var(--danger);
        line-height: 1.6;
    }

    footer {
        padding: 0 0 36px;
        color: #98a2b3;
        font-size: 11px;
        text-align: center;
    }

    @media (max-width: 760px) {
        .shell {
            width: min(100% - 20px, 1120px);
        }

        .nav-badge {
            display: none;
        }

        .hero {
            padding-top: 35px;
        }

        h1 {
            font-size: 42px;
        }

        .hero-description {
            font-size: 15px;
        }

        .grid {
            grid-template-columns: 1fr;
        }

        .answer-card,
        .trace-card,
        .evidence-section {
            padding: 20px;
        }

        .hint {
            display: none;
        }
    }
</style>
</head>

<body>

<header>
    <div class="shell nav">
        <div class="brand">
            <div class="brand-mark">
                P
            </div>

            <div>
                <div class="brand-title">
                    PolicyLens
                </div>

                <div class="brand-subtitle">
                    OPTN Policy Intelligence
                </div>
            </div>
        </div>

        <div class="nav-badge">
            Evidence-grounded RAG
        </div>
    </div>
</header>

<main>
    <section class="hero">
        <div class="shell">
            <div class="eyebrow">
                <span class="eyebrow-dot"></span>
                Self-correcting policy retrieval
            </div>

            <h1>
                Find the policy.<br />
                See the evidence.
            </h1>

            <p class="hero-description">
                Ask questions across OPTN policies and receive
                evidence-grounded answers with source verification
                and transparent retrieval recovery.
            </p>

            <form
                class="search-card"
                id="question-form"
            >
                <div class="input-wrap">
                    <textarea
                        id="question"
                        aria-label="Policy question"
                        placeholder="Ask a question about OPTN policies..."
                        required
                    ></textarea>

                    <div class="ask-row">
                        <span class="hint">
                            Answers are limited to retrieved policy evidence.
                        </span>

                        <button
                            class="ask-button"
                            id="ask-button"
                            type="submit"
                        >
                            Ask PolicyLens
                        </button>
                    </div>
                </div>
            </form>

            <div class="suggestions">
                <button
                    class="suggestion"
                    data-question="How is the Kidney Donor Profile Index calculated?"
                >
                    KDPI calculation
                </button>

                <button
                    class="suggestion"
                    data-question="If someone donated an organ before and later needs a kidney transplant, do they receive any priority?"
                >
                    Prior living donor
                </button>

                <button
                    class="suggestion"
                    data-question="What are the medical eligibility criteria for simultaneous liver-kidney allocation?"
                >
                    Liver-kidney eligibility
                </button>

                <button
                    class="suggestion"
                    data-question="How long must a transplant program preserve living donor medical records?"
                >
                    Test safe abstention
                </button>
            </div>
        </div>
    </section>

    <div class="shell">
        <section
            class="loading-card"
            id="loading"
        >
            <div class="section-label">
                Searching policy evidence
            </div>

            <div class="loading-line"></div>
            <div class="loading-line"></div>
            <div class="loading-line short"></div>
        </section>

        <section
            class="workspace"
            id="workspace"
        >
            <article class="answer-card">
                <div class="section-label">
                    Answer
                </div>

                <div
                    class="answer"
                    id="answer"
                ></div>

                <div
                    class="verification"
                    id="verification"
                ></div>
            </article>

            <div class="grid">
                <section class="trace-card">
                    <div class="section-label">
                        Retrieval trace
                    </div>

                    <div id="trace"></div>
                </section>

                <section class="evidence-section">
                    <div class="section-label">
                        Policy evidence
                    </div>

                    <div
                        class="evidence-list"
                        id="evidence"
                    ></div>
                </section>
            </div>
        </section>
    </div>
</main>

<footer>
    PolicyLens provides answers only from retrieved OPTN policy evidence.
</footer>

<script>
    const form =
        document.getElementById(
            "question-form"
        );

    const questionInput =
        document.getElementById(
            "question"
        );

    const askButton =
        document.getElementById(
            "ask-button"
        );

    const workspace =
        document.getElementById(
            "workspace"
        );

    const loading =
        document.getElementById(
            "loading"
        );

    const answerElement =
        document.getElementById(
            "answer"
        );

    const verificationElement =
        document.getElementById(
            "verification"
        );

    const traceElement =
        document.getElementById(
            "trace"
        );

    const evidenceElement =
        document.getElementById(
            "evidence"
        );

    let currentPolicyLensData =
        null;

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll(
                '"',
                "&quot;"
            )
            .replaceAll(
                "'",
                "&#039;"
            );
    }

    function cleanAnswer(answer) {
        return String(answer ?? "")
            .replace(
                /\\*\\*/g,
                ""
            )
            .replace(
                /\\\\\\*/g,
                ""
            )
            .trim();
    }

    function isAbstention(data) {
        return (
            data?.retryAssessment
                ?.sufficient === false ||
            String(
                data?.answer ?? ""
            )
                .toLowerCase()
                .includes(
                    "do not have enough information"
                )
        );
    }

    function renderAnswer(answer) {
        answerElement.innerHTML =
            "";

        const cleaned =
            cleanAnswer(answer);

        const parts =
            cleaned.split(
                /(\\[Source\\s+\\d+\\])/g
            );

        parts.forEach(
            (part) => {
                const match =
                    part.match(
                        /^\\[Source\\s+(\\d+)\\]$/
                    );

                if (!match) {
                    answerElement
                        .appendChild(
                            document
                                .createTextNode(
                                    part
                                )
                        );

                    return;
                }

                const sourceNumber =
                    Number(
                        match[1]
                    );

                const citation =
                    document
                        .createElement(
                            "button"
                        );

                citation.type =
                    "button";

                citation.className =
                    "citation-link";

                citation.textContent =
                    "Source " +
                    sourceNumber;

                citation.addEventListener(
                    "click",
                    () => {
                        const card =
                            document
                                .getElementById(
                                    "source-" +
                                    sourceNumber
                                );

                        if (!card) {
                            return;
                        }

                        card.classList.add(
                            "open"
                        );

                        card.scrollIntoView(
                            {
                                behavior:
                                    "smooth",
                                block:
                                    "center",
                            }
                        );
                    },
                );

                answerElement
                    .appendChild(
                        citation
                    );
            }
        );
    }

    function getSectionLabel(
        source
    ) {
        const content =
            String(
                source?.content ?? ""
            );

        const match =
            content.match(
                /Section\\s+([^:\\n]+):?\\s*([^\\n]*)/i
            );

        if (match) {
            const section =
                match[1].trim();

            const title =
                match[2].trim();

            return {
                section:
                    "Section " +
                    section,

                title:
                    title ||
                    "OPTN Policy Evidence",
            };
        }

        const id =
            String(
                source?.id ?? ""
            );

        return {
            section:
                id
                    .replace(
                        "policy-",
                        "Policy "
                    )
                    .replace(
                        "-section-",
                        " · Section "
                    )
                    .replace(
                        /-chunk-\\d+$/,
                        ""
                    ),

            title:
                "OPTN Policy Evidence",
        };
    }

    function renderVerification(
        data
    ) {
        const supported =
            data?.reflection
                ?.supported;

        const abstained =
            isAbstention(data);

        verificationElement
            .className =
            "verification";

        if (abstained) {
            verificationElement
                .classList.add(
                    "warning"
                );

            verificationElement
                .textContent =
                "✓ Unsupported answer prevented";

            return;
        }

        if (supported === true) {
            verificationElement
                .textContent =
                "✓ Evidence supported";

            return;
        }

        verificationElement
            .classList.add(
                "warning"
            );

        verificationElement
            .textContent =
            "Verification unavailable";
    }

    function traceStep(
        icon,
        title,
        detail,
        state = ""
    ) {
        return (
            '<div class="trace-step">' +
                '<div class="trace-icon ' +
                    escapeHtml(state) +
                '">' +
                    escapeHtml(icon) +
                '</div>' +

                '<div>' +
                    '<div class="trace-title">' +
                        escapeHtml(title) +
                    '</div>' +

                    '<div class="trace-detail">' +
                        escapeHtml(detail) +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    function renderTrace(data) {
        const initial =
            data?.retrievalAssessment;

        const retry =
            data?.retryAssessment;

        const retried =
            data?.retrievalRetried ===
            true;

        const abstained =
            isAbstention(data);

        let html = "";

        if (
            initial?.sufficient ===
            false
        ) {
            html += traceStep(
                "!",
                "More evidence needed",
                "The first search did not provide enough policy evidence.",
                "warning",
            );
        } else {
            html += traceStep(
                "✓",
                "Relevant policy evidence found",
                "The initial search found enough evidence to answer the question.",
                "success",
            );
        }

        if (retried) {
            html += traceStep(
                "↻",
                "Search refined",
                data?.retrievalQuery ||
                    "PolicyLens refined the search using OPTN terminology.",
            );

            if (
                retry?.sufficient ===
                false
            ) {
                html += traceStep(
                    "!",
                    "Evidence still insufficient",
                    "Related policies were found, but they did not directly answer the question.",
                    "warning",
                );
            } else {
                html += traceStep(
                    "✓",
                    "Relevant evidence recovered",
                    "The refined search found policy evidence that could support an answer.",
                    "success",
                );
            }
        }

        if (abstained) {
            html += traceStep(
                "✓",
                "Unsupported answer prevented",
                "PolicyLens stopped rather than generating an answer without sufficient policy evidence.",
                "success",
            );
        } else if (
            data?.reflection
                ?.supported
        ) {
            html += traceStep(
                "✓",
                "Answer verified",
                "The final answer was checked against the retrieved policy evidence.",
                "success",
            );
        } else {
            html += traceStep(
                "!",
                "Verification unavailable",
                "The response could not be fully verified against the retrieved evidence.",
                "warning",
            );
        }

        traceElement.innerHTML =
            html;
    }

    function renderEvidence(
        sources,
        citations
    ) {
        evidenceElement.innerHTML =
            "";

        if (
            !Array.isArray(
                sources
            ) ||
            sources.length === 0
        ) {
            evidenceElement
                .innerHTML =
                '<div class="empty-evidence">' +
                    'No supporting policy evidence was sufficient to answer this question.' +
                '</div>';

            return;
        }

        const citedNumbers =
            new Set(
                Array.isArray(
                    citations
                )
                    ? citations
                        .map(
                            (citation) =>
                                Number(
                                    citation
                                        .sourceNumber
                                )
                        )
                        .filter(
                            (number) =>
                                Number
                                    .isFinite(
                                        number
                                    )
                        )
                    : []
            );

        const cited = [];
        const other = [];

        sources.forEach(
            (
                source,
                index
            ) => {
                const item = {
                    source,
                    sourceNumber:
                        index + 1,
                };

                if (
                    citedNumbers.has(
                        index + 1
                    )
                ) {
                    cited.push(
                        item
                    );
                } else {
                    other.push(
                        item
                    );
                }
            }
        );

        function createSourceCard(
            source,
            sourceNumber,
            citedSource
        ) {
            const label =
                getSectionLabel(
                    source
                );

            const card =
                document
                    .createElement(
                        "article"
                    );

            card.id =
                "source-" +
                sourceNumber;

            card.className =
                "evidence-card";

            if (citedSource) {
                card.classList.add(
                    "cited"
                );
            }

            const header =
                document
                    .createElement(
                        "button"
                    );

            header.type =
                "button";

            header.className =
                "evidence-header";

            const headerText =
                document
                    .createElement(
                        "div"
                    );

            const sourceMeta =
                document
                    .createElement(
                        "div"
                    );

            sourceMeta.className =
                "source-meta";

            const section =
                document
                    .createElement(
                        "span"
                    );

            section.textContent =
                label.section;

            sourceMeta
                .appendChild(
                    section
                );

            if (citedSource) {
                const badge =
                    document
                        .createElement(
                            "span"
                        );

                badge.className =
                    "cited-badge";

                badge.textContent =
                    "Cited";

                sourceMeta
                    .appendChild(
                        badge
                    );
            }

            const title =
                document
                    .createElement(
                        "div"
                    );

            title.className =
                "evidence-title";

            title.textContent =
                label.title;

            const sourceLabel =
                document
                    .createElement(
                        "div"
                    );

            sourceLabel.className =
                "evidence-source";

            sourceLabel.textContent =
                "OPTN Policies · Source " +
                sourceNumber;

            headerText
                .appendChild(
                    sourceMeta
                );

            headerText
                .appendChild(
                    title
                );

            headerText
                .appendChild(
                    sourceLabel
                );

            const arrow =
                document
                    .createElement(
                        "div"
                    );

            arrow.className =
                "evidence-arrow";

            arrow.textContent =
                "▾";

            header.appendChild(
                headerText
            );

            header.appendChild(
                arrow
            );

            const content =
                document
                    .createElement(
                        "div"
                    );

            content.className =
                "evidence-content";

            content.textContent =
                source.content ||
                "No evidence text available.";

            card.appendChild(
                header
            );

            card.appendChild(
                content
            );

            header.addEventListener(
                "click",
                () => {
                    card.classList.toggle(
                        "open"
                    );
                },
            );

            return card;
        }

        if (
            cited.length > 0
        ) {
            const heading =
                document
                    .createElement(
                        "div"
                    );

            heading.className =
                "evidence-group-title";

            heading.textContent =
                "Cited evidence";

            evidenceElement
                .appendChild(
                    heading
                );

            cited.forEach(
                (item) => {
                    evidenceElement
                        .appendChild(
                            createSourceCard(
                                item.source,
                                item.sourceNumber,
                                true
                            )
                        );
                }
            );
        }

        if (
            other.length > 0
        ) {
            const details =
                document
                    .createElement(
                        "details"
                    );

            details.className =
                "other-evidence";

            const summary =
                document
                    .createElement(
                        "summary"
                    );

            summary.textContent =
                cited.length > 0
                    ? "Other retrieved evidence (" +
                      other.length +
                      ")"
                    : "Retrieved evidence (" +
                      other.length +
                      ")";

            details.appendChild(
                summary
            );

            const container =
                document
                    .createElement(
                        "div"
                    );

            container.className =
                "other-evidence-list";

            other.forEach(
                (item) => {
                    container
                        .appendChild(
                            createSourceCard(
                                item.source,
                                item.sourceNumber,
                                false
                            )
                        );
                }
            );

            details.appendChild(
                container
            );

            evidenceElement
                .appendChild(
                    details
                );
        }

        if (
            cited.length === 0 &&
            isAbstention(
                currentPolicyLensData
            )
        ) {
            const note =
                document
                    .createElement(
                        "div"
                    );

            note.className =
                "evidence-note";

            note.textContent =
                "Related policy evidence was retrieved, but none was sufficient to support a direct answer.";

            evidenceElement
                .prepend(
                    note
                );
        }
    }

    async function askQuestion(
        query
    ) {
        workspace
            .classList.remove(
                "visible"
            );

        loading
            .classList.add(
                "visible"
            );

        askButton.disabled =
            true;

        askButton.textContent =
            "Searching...";

        try {
            const response =
                await fetch(
                    "/search",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify(
                                {
                                    query,
                                }
                            ),
                    },
                );

            const data =
                await response
                    .json();

            currentPolicyLensData =
                data;

            if (!response.ok) {
                throw new Error(
                    data?.error ||
                    "PolicyLens could not complete the request."
                );
            }

            renderAnswer(
                data?.answer ||
                "No answer was returned."
            );

            renderVerification(
                data
            );

            renderTrace(
                data
            );

            renderEvidence(
                data?.sources,
                data?.citations
            );

            workspace
                .classList.add(
                    "visible"
                );

            setTimeout(
                () => {
                    workspace
                        .scrollIntoView(
                            {
                                behavior:
                                    "smooth",
                                block:
                                    "start",
                            }
                        );
                },
                50
            );
        } catch (error) {
            answerElement
                .innerHTML =
                "";

            const errorBox =
                document
                    .createElement(
                        "div"
                    );

            errorBox.className =
                "error-box";

            errorBox.textContent =
                error instanceof Error
                    ? error.message
                    : "Something went wrong.";

            answerElement
                .appendChild(
                    errorBox
                );

            verificationElement
                .textContent =
                "Request failed";

            verificationElement
                .className =
                "verification error";

            traceElement
                .innerHTML =
                "";

            evidenceElement
                .innerHTML =
                "";

            workspace
                .classList.add(
                    "visible"
                );
        } finally {
            loading
                .classList.remove(
                    "visible"
                );

            askButton.disabled =
                false;

            askButton.textContent =
                "Ask PolicyLens";
        }
    }

    form.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            const query =
                questionInput
                    .value
                    .trim();

            if (!query) {
                return;
            }

            await askQuestion(
                query
            );
        },
    );

    document
        .querySelectorAll(
            ".suggestion"
        )
        .forEach(
            (button) => {
                button
                    .addEventListener(
                        "click",
                        async () => {
                            const query =
                                button
                                    .dataset
                                    .question;

                            if (!query) {
                                return;
                            }

                            questionInput
                                .value =
                                query;

                            await askQuestion(
                                query
                            );
                        },
                    );
            }
        );

    questionInput
        .addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key ===
                        "Enter" &&
                    (
                        event.ctrlKey ||
                        event.metaKey
                    )
                ) {
                    form.requestSubmit();
                }
            },
        );
</script>

</body>
</html>`;