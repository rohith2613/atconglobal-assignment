# Prism — AI Business Discovery → POC

Takes the scattered material a client actually gives you — meeting transcripts, a
WhatsApp export, a process PDF, screenshots of the system they're replacing, a
recorded call, their website — and produces a discovery brief where **every claim
is traceable to the sentence it came from**, the places their own sources
contradict each other, the questions nobody has asked yet, a proposed better
process, and a clickable prototype seeded with their own data.

Built for the ATCON Global case study.

```bash
npm install
npm run dev            # http://localhost:3000 — works with no API key
```

The app opens on a **real saved pipeline run** over the sample corpus, so every
screen is populated and every citation resolves before you decide whether to
spend anything. To run it on your own material:

```bash
cp .env.example .env   # add OPENAI_API_KEY
npm run dev
```

```bash
npm test               # 252 tests, no API key needed
npm run test:live      # end-to-end over the sample corpus (needs a key)
npm run seed           # rebuild the sample engagement from scratch
npm run seed -- --resume   # redo only the stages that are missing
npm run reset          # clean slate for a demo take
```

---

## The problem I decided to solve

"Turn mixed client inputs into a requirement and a POC" could be answered with a
summariser. I don't think a summariser helps, and it makes two of the four real
failure modes worse.

Discovery goes wrong in four specific, observable ways:

| Failure | What it costs |
|---|---|
| **Contradictions between sources go unnoticed.** The WhatsApp group says "live before peak season." The transcript says "Q1 realistically." | Surfaces in week three as a change request. |
| **Nobody tracks what was never asked.** Data residency, SSO, the volume, the integration nobody scoped. | The unknown-unknowns that kill fixed-price work. |
| **Traceability dies on contact.** The brief says "must support multi-currency" and nobody can say which meeting that came from. | No evidence when scope is disputed. |
| **Days of senior time** before the client sees anything. | Slow proposals, lost deals. |

A summariser launders unverified claims into confident prose, which makes 1 and 3
worse. So the thesis here is the opposite:

> **Every claim must be traceable to a source span. Contradictions are
> first-class objects. Gaps are a primary output, not a footnote.**

Everything below follows from that.

---

## How it works

```
INGEST ──▶ SEGMENT ──▶ EXTRACT ──▶ RECONCILE ──▶ GAPS ──▶ SYNTHESISE ──▶ BLUEPRINT ──▶ POC
7 adapters  evidence    per-source  merge +       30-pt    discovery      to-be flow    validated
            units       signals     contradiction  rubric   brief          + features    AppSpec →
            E-{src}-nnn + citations detection                                            live app
                                          │
                                    ┌─────▼──────────────────────────────┐
                                    │ CLOSED LOOP around every stage     │
                                    │  1. deterministic validators (free)│
                                    │  2. adversarial LLM critic         │
                                    │  fail → the failure text becomes   │
                                    │  the next instruction → retry ×3   │
                                    │  → ship the best attempt, flagged  │
                                    └────────────────────────────────────┘
```

### Ingest — seven adapters

The brief asks for three input types. There are seven, because the brief's own
example scenario names six.

| Type | How | AI? |
|---|---|---|
| Meeting transcript | bracketed, parenthesised, bare and WebVTT shapes | no |
| WhatsApp export | iOS and Android formats, continuation lines, system-line filtering | no |
| PDF | per-page, split into paragraphs | no |
| Notes / markdown | heading-aware paragraphs | no |
| Website | fetch + readability, deduplicated | no |
| **Screenshot** | vision → what the screen reveals about the process | yes |
| **Call recording** | `whisper-1`, coalesced into citable passages | yes |

Five of seven are deterministic. AI is spent only where code cannot do the job.

### Evidence units — why citations can be trusted

Every source is split into addressable units with a stable id and a
human-meaningful locator:

```
E-src3-014  [transcript · Priya Nair @ 00:02:41]  "About forty users all in…"
```

Ids are deterministic, so a citation survives a re-run. Char offsets are found by
**scanning forward** rather than by a global search — a transcript where three
people say "Yes." would otherwise highlight the first one every time, and the
evidence drawer would be quietly, confidently wrong. There is a test for it.

This is what makes the citation *checkable*: a cited id either exists or it does
not, and a quoted span either appears in it or it does not.

### The verification loop

The unit of work is a closed loop, not a call:

**Tier 1 — deterministic, free, not fooled by confident prose.**
`HALLUCINATED_EVIDENCE` · `QUOTE_MISMATCH` · `UNGROUNDED_CLAIM` ·
`ORPHAN_FEATURE` · `UNADDRESSED_PAIN` · `UNRESOLVED_CONFLICT` · `ROLE_UNDEFINED`
· `DANGLING_REFERENCE` · `PLACEHOLDER` · `EMPTY_SECTION` · `DUPLICATE_ID`

These cannot judge whether a claim is *wrong* — that is the critic's job — but
they catch every way an output can be *malformed*, and malformed is what actually
ships. A model that invents an evidence id produces something indistinguishable
from good work at a glance, because the citation chip renders identically.

**Tier 2 — an adversarially prompted critic**, a separate call from a separate
role, shown only the claims and the text of the evidence they cite. A model asked
to grade its own completion says yes essentially always.

**The loop.** Failure → the failure text becomes the next instruction → retry, up
to three times → then ship the **best** attempt with an explicit
`NEEDS_HUMAN_REVIEW` flag, never silently.

Four details in there that are load-bearing:

- **Tier 1 short-circuits Tier 2.** No sense paying a model to opine on whether a
  claim is right when we already know its citation points at nothing.
- **Best attempt, not last.** A model told to fix three things will sometimes fix
  two and break a fourth. Returning the last attempt ships that regression.
- **`QUOTE_MISMATCH` names where the words really came from.** The commonest form
  of that violation is not fabrication — the model quoted something real and
  attached the wrong id. Naming the right one turns a dead end into a one-line
  correction; saying only "wrong" invites it to invent a different quote.
- **Retry feedback says "change nothing else."** Without it the model rewrites the
  whole document and introduces new errors while fixing the old.

### The POC is generated as data, not code

The model does not write React. It fills in a validated `AppSpec` — screens built
from a fixed catalogue of eight block types — and a deterministic renderer draws
it.

It always renders, nothing generated is ever executed, the output is diffable and
reviewable as a document, and the component vocabulary is fixed so the result
looks designed. Free-form codegen gives a better demo on a good run and nothing
at all on a bad one; for a prototype a client is going to look at, reliably fine
beats occasionally brilliant.

Seed data is mined from the client's own corpus — real customer names, lanes and
reference numbers. That is the difference between a demo they watch and a demo
they lean into.

---

## Key decisions, and why

**Next.js App Router, one repo.** API routes *are* the backend. One `npm run dev`
starts the whole thing, which is what "how the frontend and backend work
together" should look like at this scale.

**SQLite via `better-sqlite3`.** Verified to install prebuilt in ~4 seconds on
Windows with no build toolchain. Zero-config for a reviewer. Behind a repository
interface, so Postgres is a swap rather than a rewrite.

**SSE, not polling.** The pipeline takes minutes. The UI shows every stage, every
progress step, and every retry as it happens — the retries especially, because
they are the system working.

**Artifacts as whole JSON documents, keyed by (engagement, kind).** Each stage
rewrites its output wholesale and nothing queries into it server-side, so
normalising would only buy migrations. Evidence is the exception — it is looked
up by id on every citation click, so it gets real rows and an index.

**Field order in structured-output schemas is load-bearing.** `CriticVerdict`
declares `reasoning` before `verdict`; `GapResult` declares `evidenceSummary`
before `status`. With the order reversed the verdict token is generated first and
the reasoning is written to justify a decision already fixed — it reads exactly as
well and tells you nothing. I shipped that bug in an earlier project and only
caught it when a critic that was rejecting good edits started passing them the
moment the order changed. Tests assert both orderings.

**Truncation is an error, never an answer.** `finish_reason: "length"` throws. A
cut-off JSON body that happens to parse is the most dangerous silent failure in a
system like this.

**Consultant judgement is stored separately from model output.** Accept, edit or
reject any claim; a re-run cannot discard it.

---

## Things I got wrong, and what the fix was

I'd rather show these than a clean narrative, because each one changed the design.

**Confidence that meant nothing.** First version passed the extractor's own
judgement through. Since extraction runs per source, that rated **181 of 181
signals HIGH** on the real corpus. A grading that never discriminates is worse
than none, because it looks like information. `HIGH` now has exactly one meaning:
more than one independent source said it.

**Asking the model to quote what it couldn't see.** The contradiction detector was
required to quote verbatim from evidence, but was only shown each signal's
one-line summary. It correctly found the go-live contradiction and then had its
quote rejected by the anti-fabrication guard — a right answer thrown away. The
evidence units are now rendered in full. That was a bug in my harness, not in the
model.

**A guard at the wrong granularity.** I discarded contradictions where both sides
came from one source, to catch a model reporting a stated goal against current
performance. It also threw away Tom and Priya arguing in the same WhatsApp group
— which is a real contradiction, and arguably the most valuable kind. The guard is
now speaker-level.

**Unstable contradiction recall.** Asked to scan 177 signals in one call, the
model found four contradictions on one run and one on the next. The finding was
there both times; the attention wasn't. Fixed by reusing the dedup embeddings:
cross-source pairs that are semantically close but were *not* merged are exactly
the contradiction candidates, and handing over that shortlist made recall stable.

**One output ceiling for every role.** Set low it truncated real answers; set to
the model maximum it let the POC stage generate for over ten minutes before
anything noticed — the failure never arrived, so the retry that handles truncation
never fired. Now sized per role, with a request deadline.

**A dropped connection cost a whole run.** Twice, at the last stage, with seven
stages of correct paid-for work already on disk. Transport retries now live in
the client, and `--resume` reuses whatever completed.

---

## Testing

252 offline tests, no API key required.

The one that matters most: a brief containing a fabricated evidence id, a
misattributed quote, an orphan feature and an unaddressed pain point is caught by
Tier 1 with **zero API calls**. Every violation code has both a positive and a
negative case, because a validator that only ever fires is as useless as one that
never does.

The fixture suite asserts the corpus itself: both planted contradictions are
present verbatim, **no single source contains both sides of one**, and the four
planted gaps are genuinely absent.

`npm run test:live` runs the full pipeline and asserts the planted contradictions
are found and the planted gaps reported.

---

## The sample corpus

**Nordwind Logistics AS** — a fictional Norwegian freight forwarder replacing a
spreadsheet-and-email quote-to-booking process. Nine sources across six formats.

It is *designed*, not incidental. A corpus without contradictions cannot
demonstrate contradiction detection.

**Two contradictions are planted so that no single source contains both sides:**
the board's October go-live against operations' Q1; "about forty users" against
"12 staff across 3 branches."

**Four gaps are planted by omission:** data residency, authentication, the
Winfreight integration mechanism, and the cost of the current process. The
Winfreight one is the most realistic kind — the system is discussed constantly and
their IT lead says on record that he doesn't know what it exposes.

The binaries are generated from committed text sources (`npm run fixtures`), so
the corpus is reproducible rather than a set of mystery files. The screenshots
render through whatever Chrome is already installed rather than pulling in a
120 MB Playwright download. The call is real spoken audio produced with `tts-1`,
so the Whisper path is exercised by an actual mp3.

Nordwind does not exist. The app says so on the home page.

---

## Assumptions

1. Exported files stand in for live connectors — the brief permits this.
2. Single user, no authentication. Multi-tenancy is out of scope for a POC.
3. English-language inputs.
4. Screenshots are read for what they reveal about the *process*, not reproduced.
   The brief warns against copying the existing interface.
5. Cost figures use published per-token prices captured 2026-08-12, in one file.
6. The 25 MB upload cap and 3-attempt retry budget are POC-shaped, not tuned.

---

## What I deliberately did not build

Live Teams/WhatsApp connectors (the brief permits exports). Authentication and
multi-tenancy. A customer-facing portal. Anything that would have traded depth on
the evidence chain for breadth of feature list.

The Anthropic adapter is implemented against the documented Messages API and
satisfies the same interface, but no Anthropic key was available to exercise it —
a contract test proves it is structurally complete rather than pretending it is
verified.

---

## Layout

```
src/lib/ingest/      seven source adapters
src/lib/evidence/    addressable units, quote verification    ← the trust layer
src/lib/schema/      Zod + strict JSON Schema for every call
src/lib/verify/      tier-1 validators, critic, the loop      ← the reliability layer
src/lib/pipeline/    one file per stage + the orchestrator
src/lib/db/          SQLite schema and repository
src/app/api/         the HTTP surface
src/app/e/[id]/      the eight screens
src/components/      evidence drawer, POC renderer, primitives
fixtures/nordwind/   the sample corpus
docs/DEMO-SCRIPT.md  timed walkthrough
```

Start with `src/lib/evidence/index.ts` and `src/lib/verify/validators.ts`. Those
two files are the argument; the rest is plumbing around them.
