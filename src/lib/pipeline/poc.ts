import { config } from '../config'
import type { Corpus } from '../evidence'
import type { LlmClient } from '../llm/types'
import { APPSPEC_SPEC, type AppSpec } from '../schema/appspec'
import type { Blueprint } from '../schema/blueprint'
import type { Brief } from '../schema/brief'
import { runLoop, validateAppSpec, type Violation } from '../verify'
import type { EventFn } from './events'

/**
 * Generates the clickable POC as a validated AppSpec.
 *
 * The model fills in a schema; a deterministic renderer draws it. See
 * src/lib/schema/appspec.ts for why that is the shape of this stage.
 */

/**
 * Mines proper nouns and identifiers out of the client's own material for seed
 * data.
 *
 * This is what separates a POC the client recognises from a generic mockup. A
 * screen showing "Acme Corp / Widget A / $100" is a template; one showing
 * "Lofoten Marine AS / Bergen–Rotterdam / RFQ-1041" is their business, and it
 * is the difference between a demo they watch and a demo they lean into.
 */
export function extractEntities(corpus: Corpus, limit = 60): string[] {
  const counts = new Map<string, number>()
  const bump = (s: string) => counts.set(s, (counts.get(s) ?? 0) + 1)

  const STOP = new Set([
    'The', 'This', 'That', 'And', 'But', 'For', 'You', 'We', 'They', 'It', 'If', 'So', 'No', 'Yes',
    'What', 'When', 'Where', 'Which', 'Who', 'How', 'Why', 'Then', 'There', 'Their', 'Our', 'His',
    'Her', 'One', 'Two', 'Three', 'First', 'Then', 'Now', 'Not', 'All', 'Every', 'Some', 'Any',
    'Because', 'From', 'With', 'About', 'Just', 'Right', 'Well', 'Look', 'Okay', 'Sure', 'Thanks',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  ])

  for (const u of corpus.units) {
    // Multi-word proper nouns: "Lofoten Marine AS", "Bergen Seafood".
    for (const m of u.text.matchAll(/\b([A-Z][a-zà-ÿ]+(?:[ -][A-Z][a-zà-ÿ]+|[ -](?:AS|ASA|GmbH|BV|Ltd|AB))+)\b/g)) {
      if (!STOP.has(m[1].split(' ')[0])) bump(m[1])
    }
    // Reference-shaped identifiers: RFQ-1041, NW-88214, UN1263, NOBGO.
    for (const m of u.text.matchAll(/\b([A-Z]{2,5}[- ]?\d{3,6}|[A-Z]{5})\b/g)) bump(m[1])
    // Single capitalised words that recur — system and place names.
    for (const m of u.text.matchAll(/\b([A-Z][a-zà-ÿ]{3,})\b/g)) {
      if (!STOP.has(m[1])) bump(m[1])
    }
  }

  return [...counts.entries()]
    .filter(([term, n]) => n >= 2 || /\d/.test(term) || term.includes(' '))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term)
}

const SYSTEM = `You are building a clickable prototype of a proposed application, to be shown to the client in the meeting where the proposal is presented.

You do not write code. You fill in a screen specification, and a renderer draws it. Compose each screen from these blocks:

- statRow   a row of headline figures with optional comparison
- table     rows of records, optionally with a status column and a row action that navigates
- form      labelled inputs with a submit that navigates
- kanban    columns of cards, for work moving through states
- detail    a labelled field list for one record, with actions
- timeline  dated events, for history and audit
- chart     a small bar comparison
- list      primary/secondary lines with an optional badge

RULES:

1. SEED DATA MUST COME FROM THE CLIENT'S OWN MATERIAL. You are given the real names, references, places and systems that appear in their sources. Use them. Never write "Customer A", "Acme Corp", "Product 1", "Lorem ipsum" or an invented company. A prototype showing their own customers and lanes is one they lean into; a generic one is one they watch.

2. Numbers must be plausible for this business and consistent between screens. If a queue shows 23 open items, do not put 8 rows in the table and call it complete — label it as a page of the 23.

3. Every screen must be reachable and must lead somewhere. Give tables a rowActionTarget, forms a submitTarget, detail screens an action that goes back. A prototype where nothing is clickable is a picture.

4. Build the screens the BLUEPRINT specifies, for the roles it defines. Use the blueprint's role names exactly. Do not invent a role.

5. Show the improvement. If the proposal removes a two-day wait, the queue screen should make the wait visible; if it removes duplicate entry, do not show a re-keying step. The first screen should make the point on its own.

6. SIZE. 3 to 5 screens, each with 1 to 3 blocks. Tables carry 5 to 8 rows — enough to look real, and label the count if the queue is larger. Forms carry at most 8 fields. Kanban columns carry at most 4 cards each.

A tight prototype that renders beats a sprawling one that gets cut off, and an answer that overruns the output limit is discarded in full rather than truncated.

Ids: screens SC1, SC2…; roles must reuse the blueprint's role ids.`

export async function generateAppSpec(args: {
  brief: Brief
  blueprint: Blueprint
  corpus: Corpus
  llm: LlmClient
  runId: string
  engagementId: string
  onEvent: EventFn
}): Promise<{ spec: AppSpec; needsHumanReview: boolean; violations: Violation[] }> {
  const { brief, blueprint, corpus, llm, runId, engagementId, onEvent } = args

  const entities = extractEntities(corpus)
  onEvent({ t: 'note', stage: 'poc', text: `seeding with ${entities.length} entities from the client's own material` })

  const user = [
    `APPLICATION PURPOSE: ${brief.goal.statement}`,
    '',
    `PROPOSAL: ${blueprint.summary}`,
    '',
    'ROLES (use these ids and names exactly):',
    ...blueprint.roles.map((r) => `  ${r.id} — ${r.name}: ${r.responsibilities}`),
    '',
    'SCREENS TO BUILD:',
    ...blueprint.screens.map(
      (s) => `  ${s.id} "${s.name}" for ${s.roleIds.join(', ')} — ${s.purpose}`,
    ),
    '',
    'FEATURES THESE SCREENS DELIVER:',
    ...blueprint.features.map((f) => `  ${f.id} [${f.priority}] ${f.name}: ${f.description}`),
    '',
    'NAVIGATION THE PROTOTYPE SHOULD SUPPORT:',
    ...blueprint.flow.map((f) => `  ${f.fromScreenId} → ${f.toScreenId} on: ${f.trigger}`),
    '',
    'PAIN POINTS THE PROTOTYPE SHOULD VISIBLY ADDRESS:',
    ...brief.painPoints.filter((p) => p.impact === 'HIGH').map((p) => `  ${p.id} ${p.statement}`),
    '',
    'REAL NAMES, REFERENCES AND SYSTEMS FROM THE CLIENT MATERIAL — seed every screen from these:',
    entities.join(' · '),
  ].join('\n')

  const result = await runLoop<AppSpec>({
    stage: 'poc',
    maxAttempts: config.maxAttempts,
    onEvent: (e) => {
      if (e.t === 'retry') onEvent({ t: 'attempt', stage: 'poc', attempt: e.attempt, because: e.because })
    },
    generate: async (feedback, attempt) => {
      const { data } = await llm.complete<AppSpec>({
        role: 'poc',
        stage: 'poc',
        runId,
        engagementId,
        attempt,
        system: SYSTEM,
        user: `${user}${feedback ? `\n\n---\n\n${feedback}` : ''}`,
        schema: APPSPEC_SPEC,
        summary: `generate POC spec${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
      })
      return data
    },
    validate: (spec) => validateAppSpec(spec, blueprint),
  })

  return { spec: result.value, needsHumanReview: result.needsHumanReview, violations: result.violations }
}
