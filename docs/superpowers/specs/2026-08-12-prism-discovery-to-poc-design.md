# Prism — AI Business Discovery → POC

**Design spec.** ATCON Global case study, Backend & Integrations Engineer.
Author: Rohith Sriramula · 2026-08-12 · Submission due 2026-08-18

---

## 1. The problem, stated precisely

A consulting discovery phase turns scattered client inputs into a requirement everyone agrees on and a POC that proves the idea. It fails in four specific, observable ways:

| Failure | What it costs |
|---|---|
| **Contradictions across sources go unnoticed.** WhatsApp says "live before peak season"; the transcript says "Q1 realistically." | Surfaces in week 3 as a change request. Margin. |
| **Nobody tracks what was never asked.** Data residency, SSO, volumes, the ERP integration — absent, not wrong. | The unknown-unknowns that kill fixed-price engagements. |
| **Traceability dies on contact.** The brief says "must support multi-currency"; nobody can say which meeting that came from. | No evidence when scope is disputed. |
| **Days of senior time before the client sees anything.** | Slow proposal cycle, lost deals. |

These are not solved by "summarise the documents." A summariser makes failures 1–3 *worse*, because it launders unverified claims into confident prose.

**Thesis:** every claim must be traceable to a source span; contradictions are first-class objects; gaps are a primary output, not a footnote.

## 2. Scope

**In:** ingest of 7 input types, evidence-grounded understanding, contradiction detection, gap analysis, to-be process design, solution blueprint, generated clickable POC, a run trace, and a UI that makes all of it inspectable.

**Out:** live Teams/WhatsApp API connectors (the brief explicitly permits exports), multi-tenant auth, production hardening, real-time collaboration.

## 3. Architecture

```
INGEST ──▶ SEGMENT ──▶ EXTRACT ──▶ RECONCILE ──▶ SYNTHESISE ──▶ BLUEPRINT ──▶ POC
7 adapters  evidence    per-source  cross-source   discovery      to-be flow    validated
            units       signals     merge +        brief          + features    AppSpec →
            E-{src}-n   + citations contradictions                              live app
                                         │
                                   ┌─────▼───────────────────────────┐
                                   │ CLOSED LOOP, every stage        │
                                   │ 1. deterministic validators     │
                                   │ 2. adversarial LLM critic       │
                                   │ fail → failure text becomes the │
                                   │ next instruction → retry (×3)   │
                                   │ → abandon + flag for human      │
                                   └─────────────────────────────────┘
```

The central decision: **the LLM never produces a claim the system cannot check.** Everything below follows from that.

### 3.1 Ingest — 7 adapters

The brief asks for three input types. Seven are supported because the brief's own example scenario names six.

| Type | Adapter | Mechanism |
|---|---|---|
| Meeting transcript | `.txt` / `.vtt` speaker-turn parser | deterministic |
| WhatsApp export | `[dd/mm/yy, hh:mm] Name: msg` parser | deterministic |
| PDF process doc | per-page text extraction | `unpdf` |
| Screenshot | UI inventory extraction | `gpt-4.1-mini` vision |
| Website reference | fetch + readability | `cheerio` |
| **Audio call** | transcription with timestamps | `whisper-1` |
| Notes / markdown | passthrough | deterministic |

Five of seven are deterministic. AI is spent only where code cannot do the job.

### 3.2 Segment — evidence units

Every source is split into addressable units with a stable ID and a human-meaningful locator:

```ts
type EvidenceUnit = {
  id: string          // "E-src3-014" — stable, deterministic
  sourceId: string
  sourceType: SourceType
  locator: string     // "Priya Nair @ 00:14:32" | "p.4 ¶2" | "msg #87"
  text: string
  charStart: number   // offset into normalised source text
  charEnd: number
}
```

Evidence IDs give three things at once: a deterministic citation anchor (no fuzzy string matching), token locality (an extraction call sees one source, not the corpus), and **checkability** — a cited ID either exists in the corpus or it does not, and that is asserted rather than hoped for.

### 3.3 Extract — per source, in parallel

Each source yields typed *signals*, every one carrying `evidenceIds: string[]` and a verbatim `quote`:

`GOAL` · `CURRENT_PROCESS_STEP` · `PAIN_POINT` · `REQUIREMENT` · `CONSTRAINT` · `STAKEHOLDER` · `SYSTEM` · `METRIC` · `DECISION` · `OPEN_QUESTION`

Sources are independent, so this stage fans out concurrently (cap 6 in flight).

### 3.4 Reconcile — cross-source

1. **Dedup/merge.** `text-embedding-3-small` cosine ≥ 0.86 → candidate pair → LLM merge judge. Merged signals accumulate evidence from every source that corroborates them, which is what drives confidence.
2. **Contradiction detection.** Signals of the same type on the same subject with incompatible values become a `Conflict`:

```ts
type Conflict = {
  id: string
  subject: string            // "Go-live timeline"
  sideA: { claim, evidenceIds, quote }
  sideB: { claim, evidenceIds, quote }
  severity: 'BLOCKING' | 'MATERIAL' | 'MINOR'
  resolutionQuestion: string // client-ready, copy-pasteable
}
```

3. **Confidence.** `f(independent corroborating sources, directness of evidence)` → HIGH / MEDIUM / LOW, shown on every claim in the UI.

### 3.5 Gap radar

A fixed ontology of 30 questions across 8 dimensions — *Users & Roles, Process & Volume, Data, Integrations, Non-functional, Compliance, Commercial, Delivery* — covering what every discovery must answer: who the roles are, transaction volumes, integrations, auth/SSO, data residency, SLAs, retention, reporting, migration, budget, timeline, ownership, success metrics. Each is scored **COVERED / PARTIAL / MISSING** with the evidence that covers it. Every MISSING or PARTIAL auto-generates a specific, client-ready clarifying question.

This is the consultant's actual value, and the ontology is a fixed rubric, so coverage cannot silently drift between runs the way a free-form "what's missing?" prompt does.

### 3.6 Synthesise — the Discovery Brief

Goal · current process (ordered) · pain points ranked by impact × evidence strength · requirements (MoSCoW, each with an ID) · constraints · stakeholders · open questions · conflicts. Every element carries citations.

### 3.7 Blueprint — the better process

Each current-process step is classified **KEEP / SIMPLIFY / AUTOMATE / ELIMINATE**, with the reason and the pain point ID it resolves. Rendered as as-is and to-be Mermaid diagrams side by side.

Then: features (each mapped to requirement IDs), user roles, screens/modules, and the flow between them. The feature↔requirement mapping is rendered as a traceability matrix and is machine-checked (see `ORPHAN_FEATURE`, `UNADDRESSED_PAIN` below).

### 3.8 POC generation — constrained, not free-form

**The LLM does not emit React.** It emits a validated `AppSpec`: screens composed from a fixed component catalog (`table`, `form`, `kanban`, `detail`, `statRow`, `timeline`, `chart`, `list`), with seed data derived from entities actually extracted from the client corpus — real names from the sources, never lorem.

A **deterministic React renderer** draws the spec. This is chosen over free-form code generation because it always renders, executes no generated code, is diffable and versionable, and is the same philosophy as the rest of the system: constrain generation into a validated schema, let trusted code do the rest.

A separate exporter writes the spec out as a real Next.js scaffold for teams who want the code.

### 3.9 The loop — how reliability is actually obtained

The unit of work is a closed loop, not a call: **generate → verify → feed the failure back as the next instruction → retry → abandon with a report.** The model is an unreliable component inside a control loop, not the system itself. Verification is split into a free deterministic tier and a paid semantic tier, so common failures cost nothing to catch and the model is spent only on judgements code cannot make.

**Tier 1 — deterministic validators (no LLM, ~zero cost):**

| Check | Catches |
|---|---|
| `HALLUCINATED_EVIDENCE` | a cited evidence ID that is not in the corpus |
| `QUOTE_MISMATCH` | the quoted span is not present in the cited unit (normalised compare) |
| `UNGROUNDED_CLAIM` | a goal / pain / requirement with zero citations |
| `ORPHAN_FEATURE` | a proposed feature mapping to no requirement |
| `UNADDRESSED_PAIN` | a pain point no feature resolves |
| `UNRESOLVED_CONFLICT` | a conflict that raised no open question |
| `ROLE_UNDEFINED` | a screen referencing a role absent from the roles list |
| `PLACEHOLDER` | `TBD`, `TODO`, `lorem`, `[...]` |
| `EMPTY_SECTION` | a required brief section with no content |

**Tier 2 — adversarial LLM critic.** Validators catch *malformed*; they cannot judge *wrong*. The critic sees only the claims and their cited evidence — a few hundred tokens regardless of corpus size — as a **separate call from a separate role**, because a model asked to grade its own completion says yes essentially always. It is prompted adversarially: *a false PASS is far more costly than a false FAIL*.

**Critical schema detail:** the critic's JSON Schema emits `reasoning` **before** `verdict`. With the reverse ordering the verdict token is generated first and the stated reasons are written to justify a decision already fixed — the reasoning is decorative and the verdict is uninformed. Field order in a structured-output schema is load-bearing. (This is a bug I shipped and later found in a previous project; it is corrected by construction here.)

**Loop control:** on failure, the failure text becomes the next instruction and only the failing stage re-runs, up to 3 attempts. After that the system does not silently ship — it emits an explicit `NEEDS_HUMAN_REVIEW` item. Every attempt, prompt hash, token count, latency and verdict is written to a **Run Trace** the UI renders.

### 3.10 Human-in-the-loop

Every AI claim can be accepted, edited, or rejected in the UI. Edits are versioned and marked `HUMAN`, so the trace shows provenance and the brief distinguishes what the machine asserted from what a consultant confirmed. Rejected claims are excluded from downstream synthesis on re-run.

## 4. Stack and why

| Choice | Reason |
|---|---|
| **Next.js 15 App Router + TypeScript** | Frontend and backend in one repo; API routes *are* the backend. One `npm run dev`. Directly answers "how the frontend and backend work together." |
| **SQLite via `better-sqlite3`** | Verified: installs prebuilt in ~4s on Windows, no build toolchain. Zero-config for a reviewer: clone → install → run. Behind a repository interface so Postgres is a swap, not a rewrite. |
| **Tailwind + custom design tokens** | Dense, precise, no component-library default look. |
| **SSE for pipeline progress** | The pipeline takes tens of seconds; the UI must show it working, not spin. Real streaming integration, not polling. |
| **Zod + OpenAI strict JSON Schema** | Every LLM call is schema-validated at the API layer, then re-validated in-process. `finish_reason: "length"` is an **error**, never an answer — silent truncation is the most dangerous failure mode. |
| **Provider adapter** | OpenAI default (assignment key); Anthropic behind one env var. No provider lock-in in the domain code. |

**Models:** router/classification `gpt-4.1-mini` · extraction `gpt-4.1-mini` · synthesis `gpt-4.1` · vision `gpt-4.1-mini` · audio `whisper-1` · embeddings `text-embedding-3-small`. Each is one env var.

## 5. Sample corpus — designed, not incidental

**Nordwind Logistics**, a mid-size European freight forwarder replacing a spreadsheet-and-email quote-to-booking process.

2 Teams transcripts · 1 WhatsApp export · 1 process PDF (`Quotation SOP v3.2`) · 3 legacy-app screenshots · 1 website reference · **1 real `.mp3` call generated with `tts-1`** so the Whisper path is genuinely exercised rather than stubbed.

**Planted contradictions:** go-live "before peak season, end of October" (WhatsApp) vs "Q1 next year realistically" (transcript 2); "about 40 users" (transcript 1) vs "12 staff across 3 branches" (SOP PDF).

**Planted gaps:** no data residency, no SSO/auth requirement, no TMS integration detail, no success metric.

The fixture is designed so the system's differentiating features have something true to find. A corpus without contradictions cannot demonstrate contradiction detection.

## 6. Frontend — nine screens

1. **Engagements** — client list, source counts, brief status
2. **Sources** — drag-drop ingest, per-source cards, live SSE pipeline progress
3. **Discovery Brief** — every claim carries a citation chip; clicking opens an **evidence drawer** with the exact span highlighted in its source context. *This is the interaction the whole design exists to enable.*
4. **Conflicts** — side-by-side contradiction cards with both quotes and the resolution question
5. **Gap Radar** — coverage grid over the ontology; MISSING items produce a copy-ready client question list
6. **Process** — as-is vs to-be Mermaid, with KEEP/SIMPLIFY/AUTOMATE/ELIMINATE chips
7. **Blueprint** — feature↔requirement traceability matrix, roles, screens
8. **POC** — the generated clickable prototype with a role switcher
9. **Run Trace** — every call, model, tokens, cost, latency, validator verdicts, retries

Visual direction: dark-first, dense, precise. A consulting workbench, not a SaaS landing page. WCAG AA contrast, visible focus states, `prefers-reduced-motion` respected.

## 7. Testing

- **Unit, offline, no API key:** all 7 ingest parsers against fixtures; evidence-unit ID stability; every Tier-1 validator, each with a positive and negative case; AppSpec schema validation; renderer smoke tests.
- **The deliberately-broken-brief test:** a brief containing a hallucinated evidence ID, an orphan feature, and an unaddressed pain must be caught by Tier 1 with zero API calls. This is the test that proves the loop is real.
- **Live e2e (key required, separate command):** full pipeline over the Nordwind corpus, asserting the planted contradictions are found and the planted gaps are reported MISSING.

## 8. Assumptions

1. Exported files stand in for live connectors — the brief permits this explicitly.
2. Single-user; no authentication. Multi-tenant is out of scope for a POC.
3. The Nordwind corpus is synthetic, authored by me to exercise the system. It is labelled as such.
4. English-language inputs.
5. Screenshots are analysed for UI inventory and workflow inference, not pixel-perfect reproduction — the brief warns against copying the existing interface.
6. Cost figures in the run trace use published per-token prices at time of writing, held in one config file.

## 9. Success criteria

- All 5 brief requirements demonstrably working over the sample corpus.
- Every claim in the brief resolves to a real source span, verified by Tier-1 validators on every run.
- Both planted contradictions detected; all four planted gaps reported.
- Generated POC renders and is clickable, seeded with entities from the actual corpus.
- Offline test suite passes with no API key present.
- `git clone && npm install && npm run dev` works on a clean machine.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Pipeline latency makes the demo feel broken | SSE progress with per-stage detail; fixture corpus sized for a ~60–90s full run; cached prior run loads instantly |
| Extraction quality varies run to run | Validators are deterministic and run every time; the critic loop retries; low-confidence claims are marked, not hidden |
| Generated AppSpec is bland | Seed data extracted from the corpus; fixed catalog tuned so a table+form+kanban app looks real |
| Scope overrun before 18 Aug | Phases 1–5 are the defensible core and land first; POC generator and human-in-the-loop are phase 6–7 and independently droppable |
