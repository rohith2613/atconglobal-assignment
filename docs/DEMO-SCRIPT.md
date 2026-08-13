# Demo script

A ~7 minute walkthrough. Three moments carry the whole thing; everything else is
context for them.

**Before recording**

```bash
npm run reset          # drops the database and reloads the saved run
npm run dev            # http://localhost:3000
```

Open the browser at 1440×900 or wider, zoom 100%. The evidence drawer is 620px
and wants room beside it.

---

## 0:00 — What the problem is (45s)

Land on the home page. Do not click anything yet.

> "A consultant starts an engagement with a pile of material. Two Teams
> transcripts, a WhatsApp group, a process PDF, screenshots of the system
> they're replacing, a voice note from the person who actually does the job.
>
> Reading all of it and turning it into a requirement is a week of senior time,
> and three things reliably go wrong: contradictions between sources get missed,
> nobody tracks the questions that were never asked, and by the time it's
> written down nobody can say which meeting a given requirement came from.
>
> This is Prism. Nordwind Logistics is a fictional freight forwarder — I wrote
> its corpus so it contains problems worth finding."

Click into **Nordwind Logistics**.

## 0:45 — What went in (45s)

You land on **Sources**.

> "Nine sources, six different formats. Five of these are parsed
> deterministically. Two are not: the screenshots go through a vision model, and
> this" — point at `call-with-erik.mp3` — "is a real two-minute recording that
> Whisper transcribed. It's genuinely audio, not a stub.
>
> 233 citable passages. Every claim you're about to see points back at one of
> them by id."

Point at the pipeline panel.

> "Eight stages. Each one is verified before the next begins — I'll come back to
> what that means."

## 1:30 — **MOMENT ONE: the evidence chain** (90s)

Go to **Discovery brief**. Scroll to *What it costs them*.

> "This is the brief a consultant would write. Goal, how the process works
> today, what it costs them, requirements, and what we still need to ask.
>
> Every single claim has one of these." — point at a citation chip.

**Click a citation chip.** Let the drawer land.

> "That opens the source. Not a summary of the source — the actual transcript,
> with the exact passage the claim was drawn from highlighted in place, and the
> speaker and timestamp it came from.
>
> This is the part that makes the rest usable. When a client disputes scope in
> week six, you don't argue about what was said. You open the claim."

Close it. Click a claim with **2 sources** on the chip.

> "This one is corroborated by two independent sources — arrow keys move between
> them. That's also what the confidence grade means here: HIGH means more than
> one source said it, not that the model felt sure."

Hover the ✓ ✎ ✕ controls on a claim.

> "And a consultant can accept, correct, or reject any of it. Their judgement is
> stored separately from the model's output, so re-running the analysis doesn't
> quietly discard it."

## 3:00 — **MOMENT TWO: something no single document contains** (75s)

Go to **Contradictions**.

> "This is the finding I care most about."

Read the go-live conflict aloud, both sides.

> "The WhatsApp group says the board wants it live before peak season — end of
> October, non-negotiable. The second transcript has the Head of Operations
> saying nothing goes live in October, Q1 at the earliest.
>
> Neither document contains a contradiction. It only exists across the corpus.
> That's precisely why a consultant reading files one at a time misses it, and
> why it turns up in week three as a change request.
>
> Both sides quote verbatim, and a contradiction whose quote can't be verified
> against the cited evidence is discarded rather than shown — I'd rather miss one
> than send someone to a client asking about something nobody said."

Point at the resolution question.

> "And that's written to be sent as it is."

## 4:15 — What nobody asked (60s)

Go to **Gap radar**.

> "Every engagement is scored against the same thirty questions, so an entire
> missing dimension can't slip past. The row is there whether the sources
> mention it or not."

Point at Compliance, all red.

> "Data residency — never mentioned, and this client operates across Norway and
> the Netherlands. Authentication — never mentioned. And this one" — point at
> IN2 — "is the realistic kind: Winfreight comes up constantly, and their IT lead
> says on record that he doesn't know what it exposes."

Scroll to the bottom.

> "That's the actual deliverable. Every unanswered question, worst first, ready
> to send."

## 5:15 — The proposal (60s)

Go to **As-is / To-be**.

> "Every step of how they work today gets a disposition — keep, simplify,
> automate, or eliminate — with the reason and the pain point it resolves.
>
> The Friday reconciliation gets eliminated, and the rationale says why: it only
> exists because they type every quote twice."

Go to **Solution blueprint**, scroll to the matrix.

> "And this is the check that stops a proposal inventing scope. Every feature
> traces to a requirement the client actually stated. A feature that traces to
> nothing is caught before it reaches the client."

## 6:15 — The prototype (45s)

Go to **Prototype**. Click a table row to navigate. Switch role.

> "Generated from the blueprint, and seeded with their own customers and lanes
> rather than placeholder data — that's what makes a client lean in.
>
> The model didn't write this code. It filled in a validated specification and a
> renderer draws it, so nothing generated is ever executed and it can't fail to
> parse."

Expand the AppSpec JSON briefly.

## 7:00 — **MOMENT THREE: the receipts** (45s)

Go to **Run trace**.

> "Last thing. Every model call, what it cost, and — the amber rows — every
> output that got rejected and regenerated.
>
> Those are quotes that didn't appear in the evidence they cited. Deterministic
> checks caught them for nothing, fed the failure back as the instruction, and
> the model rewrote it. Where the loop couldn't clear something within its
> retries, it says so rather than presenting it as clean.
>
> That's the whole argument: the model is an unreliable component inside a
> control loop, not the system itself. It's why you can trust the citations."

**End.**

---

## If something goes wrong

- Drawer highlight looks off → `npm run reset`, the saved run has verified offsets.
- Diagrams blank → hard refresh; Mermaid renders client-side.
- Want a live run on camera → needs `OPENAI_API_KEY` in `.env` and takes ~6 min.
  Better to show the saved run and mention the live one.

## Three sentences, if you only get one minute

> Prism reads a client's scattered material, works out what they need, and shows
> where their own sources contradict each other and what nobody has asked yet —
> with every claim traceable to the exact sentence it came from. Every stage
> checks its own output against the evidence before the next one runs, and shows
> you what it rejected. It ends with a clickable prototype seeded from the
> client's own data.
