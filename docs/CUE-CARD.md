# Cue card — read this while recording

Keep this on your phone or a second screen. Bold = what you click. Quoted = roughly what you say.
You do not need to say it word for word. Say it in your own words, in your own accent, at your own pace.

If you fluff a line, pause for two seconds and say it again. You can cut it later, or leave it — nobody minds.

---

### 0:00 — Home page

**Just sit on the home page. Don't click yet.**

> "This is Prism, built for the ATCON case study.
>
> The problem it solves: a consultant starts an engagement with a pile of mixed material. Meeting transcripts, a WhatsApp group, a process PDF, screenshots of the system being replaced, a recorded call. Reading all of that and turning it into a requirement is a week of senior time.
>
> And three things reliably go wrong. Contradictions between sources get missed. Nobody tracks the questions that were never asked. And by the time it's written down, nobody can say which meeting a given requirement came from.
>
> Nordwind Logistics is a fictional freight forwarder. I wrote its material myself so that it contains problems worth finding."

**Click "Nordwind Logistics AS"**

---

### 0:50 — Sources

> "Nine sources, six different formats.
>
> Five of these are parsed with plain code. Two are not — the screenshots go through a vision model, and this call recording is a real two-minute audio file that Whisper transcribed. It's genuinely audio, not a placeholder.
>
> That produced two hundred and thirty-three citable passages. Every claim you're about to see points back at one of them."

**Point at the Pipeline panel**

> "Eight stages, and each one is checked before the next runs. I'll come back to that at the end."

---

### 1:35 — Discovery brief  ← **FIRST BIG MOMENT**

**Click "02 Discovery brief". Scroll slowly to "What it costs them".**

> "This is the brief a consultant would write. The goal, how the process works today, what it's costing them, the requirements, and what we still need to ask.
>
> Every single claim has one of these little markers."

**Click any amber citation chip. Wait for the drawer. Let it sit for a second.**

> "And that opens the source. Not a summary of the source — the actual transcript, scrolled to the exact passage the claim came from, highlighted in place, with the speaker and the timestamp.
>
> This is the part that makes everything else usable. When a client argues about scope in week six, you don't argue back. You open the claim."

**Press Escape. Find a chip that says "2 sources" and click it.**

> "Where a claim is backed by two different sources, you can step between them with the arrow keys. That's also what the confidence grade means — HIGH means more than one source said it, not that the model felt confident."

**Press Escape. Hover over any claim so the ✓ ✎ ✕ buttons appear.**

> "And a consultant can accept, correct, or reject anything here. That judgement is stored separately from the model's output, so re-running the analysis doesn't wipe it."

---

### 3:10 — Contradictions  ← **SECOND BIG MOMENT**

**Click "03 Contradictions"**

> "This is the finding I care most about."

**Read the go-live one — point at side A, then side B.**

> "The WhatsApp group says the board wants it live before peak season. End of October, non-negotiable.
>
> The second transcript has the Head of Operations saying nothing goes live in October, Q1 at the earliest.
>
> Neither document contains a contradiction. It only exists across the whole pack. That's exactly why a consultant reading files one at a time misses it — and why it turns up in week three as a change request.
>
> Both sides quote the source word for word. If a contradiction's quote can't be verified against the evidence, it's thrown away rather than shown. I'd rather miss one than send someone to a client asking about something nobody said."

**Point at the "Ask the client" box**

> "And that question is written to be sent as it is."

---

### 4:25 — Gap radar

**Click "04 Gap radar"**

> "Every engagement is scored against the same thirty questions, so a whole missing area can't slip past. The row is there whether the sources mention it or not."

**Point at Compliance and Non-functional — the red ones**

> "Data residency — never mentioned once, and this client operates across Norway and the Netherlands.
>
> Authentication — never mentioned.
>
> And this one is the realistic kind. Their system Winfreight comes up constantly, and their own IT lead says on the record that he doesn't know what it exposes."

**Scroll to the bottom box**

> "That's the actual deliverable. Every unanswered question, worst first, ready to paste into an email."

---

### 5:20 — Process and Blueprint

**Click "05 As-is / To-be"**

> "Every step of how they work today gets a decision — keep it, simplify it, automate it, or remove it — with the reason and the pain point it fixes.
>
> The green ones are automated. The Friday reconciliation gets removed entirely, and the reason says why: it only exists because they type every quote twice."

**Click "06 Solution blueprint", scroll to the matrix at the bottom**

> "And this is the check that stops a proposal inventing work nobody asked for. Every feature has to trace back to a requirement the client actually stated. If it traces to nothing, it gets caught before it reaches the client."

---

### 6:10 — Prototype

**Click "07 Prototype". Click an "Open" button in the table. Then change the role dropdown.**

> "This is generated from the blueprint, and seeded with their own customers and lanes — not placeholder data. That's the difference between a client watching a demo and leaning into one.
>
> And the model didn't write this code. It filled in a validated specification, and a renderer draws it. So nothing generated is ever executed, and it can't fail to load."

---

### 6:45 — Run trace  ← **THIRD BIG MOMENT**

**Click "08 Run trace". Scroll down to the big table.**

> "Last thing. Every model call, what it cost, and — these amber rows — every output the system rejected and regenerated.
>
> Those are quotes that didn't actually appear in the evidence they cited. Cheap deterministic checks caught them for nothing, fed the failure back as the instruction, and the model rewrote it. Where it couldn't fix something in three tries, it says so instead of pretending the output is clean.
>
> That's the whole argument. The model is treated as an unreliable part inside a control loop, not as the system itself. It's why the citations can be trusted.
>
> Thanks for watching."

**Stop recording.**

---

## If something goes wrong mid-take

- **A page looks blank** — refresh once (F5). Everything is pre-loaded so it'll be instant.
- **You lose your place** — the left sidebar is numbered 01 to 08. Just go in order.
- **You want to start over** — stop recording, and in the terminal press Ctrl+C, then `npm run reset`, then `npm run dev`. Fresh state.

## The one-minute version, if you'd rather do a short one

> "Prism reads a client's scattered material and works out what they need — with every claim traceable to the exact sentence it came from. It finds where their own sources contradict each other, which is something no single document contains. It lists what nobody has asked yet. And it ends with a clickable prototype seeded from their own data. Every stage checks its own output against the evidence before the next one runs, and shows you what it rejected."
