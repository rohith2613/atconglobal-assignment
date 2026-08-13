import { config } from '../config'
import type { Corpus } from '../evidence'
import type { LlmClient } from '../llm/types'
import {
  APPPLAN_SPEC,
  SCREEN_SPEC,
  type AppPlan,
  type AppSpec,
  type ScreenOut,
} from '../schema/appspec'
import type { Blueprint } from '../schema/blueprint'
import type { Brief } from '../schema/brief'
import { runLoop, validateAppSpec, type Violation } from '../verify'
import { mapWithConcurrency, type EventFn } from './events'

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

const BLOCK_MENU = `- statRow   a row of headline figures with optional comparison
- table     rows of records, optionally with a status column and a row action that navigates
- form      labelled inputs with a submit that navigates
- kanban    columns of cards, for work moving through states
- detail    a labelled field list for one record, with actions
- timeline  dated events, for history and audit
- chart     a small bar comparison
- list      primary/secondary lines with an optional badge`

const SHARED_RULES = `SEED DATA MUST COME FROM THE CLIENT'S OWN MATERIAL. You are given the real names, references, places and systems that appear in their sources. Use them. Never write "Customer A", "Acme Corp", "Product 1", "Lorem ipsum" or an invented company. A prototype showing their own customers and lanes is one the client leans into; a generic one is one they watch.

Numbers must be plausible for this business and consistent between screens.

Show the improvement. If the proposal removes a two-day wait, make the wait visible; if it removes duplicate entry, do not show a re-keying step.`

const PLAN_SYSTEM = `You are planning a clickable prototype of a proposed application, to be shown to the client when the proposal is presented.

You do not write code. You plan screens, and a later step fills each one in. Available block types:

${BLOCK_MENU}

${SHARED_RULES}

PLAN RULES:

1. Build the screens the BLUEPRINT specifies, for the roles it defines. Reuse the blueprint's role ids and names exactly. Do not invent a role.
2. 3 to 5 screens. Each screen lists 1 to 3 block kinds — that is all you decide here, not their contents.
3. The prototype must be clickable end to end. Set "leadsTo" so a user can get from the first screen through the flow. The last screen may lead back to the first.
4. The first screen should make the point of the whole proposal on its own.

Ids: screens SC1, SC2…`

const SCREEN_SYSTEM = `You are filling in ONE screen of a clickable prototype. A renderer draws exactly what you return.

${BLOCK_MENU}

${SHARED_RULES}

SIZE — this matters, and an answer that overruns is discarded in full:
- tables: 5 to 8 rows, never more. If the real queue is larger, say so in the title rather than listing it.
- forms: at most 8 fields
- kanban: at most 4 cards per column
- timeline: at most 6 events
- keep every string short; these are cells and labels, not prose

Return ONLY the blocks for the screen you are given, in the order the block kinds are listed.`

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
      // Step 1 — plan. Small output: names, roles, and what each screen is made of.
      const { data: plan } = await llm.complete<AppPlan>({
        role: 'poc',
        stage: 'poc',
        runId,
        engagementId,
        attempt,
        system: PLAN_SYSTEM,
        user: `${user}${feedback ? `\n\n---\n\n${feedback}` : ''}`,
        schema: APPPLAN_SPEC,
        summary: `plan POC screens${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
      })

      onEvent({
        t: 'note',
        stage: 'poc',
        text: `${plan.appName}: ${plan.screens.length} screens planned — ${plan.screens.map((s) => s.name).join(', ')}`,
      })

      // Step 2 — fill each screen in, concurrently. Every call is bounded by
      // what one screen can contain, which is what stops the overruns.
      const screens = await mapWithConcurrency(plan.screens, config.concurrency, async (s, i) => {
        const { data } = await llm.complete<ScreenOut>({
          role: 'poc',
          stage: 'poc',
          runId,
          engagementId,
          attempt,
          system: SCREEN_SYSTEM,
          user: [
            `APPLICATION: ${plan.appName} — ${plan.tagline}`,
            `THIS SCREEN: ${s.id} "${s.name}" — ${s.purpose}`,
            `SEEN BY: ${s.roleIds.map((r) => plan.roles.find((x) => x.id === r)?.name ?? r).join(', ')}`,
            `BLOCKS TO PRODUCE, IN ORDER: ${s.blockKinds.join(', ')}`,
            s.leadsTo
              ? `The primary action on this screen must navigate to "${s.leadsTo}". Use it as rowActionTarget, submitTarget, or an action target.`
              : 'This screen does not need to navigate onward.',
            '',
            'OTHER SCREENS you may navigate to:',
            plan.screens.map((x) => `  ${x.id} — ${x.name}`).join('\n'),
            '',
            'REAL NAMES, REFERENCES AND SYSTEMS FROM THE CLIENT MATERIAL — seed from these:',
            entities.join(' · '),
          ].join('\n'),
          schema: SCREEN_SPEC,
          summary: `fill screen ${i + 1}/${plan.screens.length}: ${s.name}`,
        })

        return { id: s.id, name: s.name, icon: s.icon, roleIds: s.roleIds, blocks: data.blocks }
      })

      return {
        appName: plan.appName,
        tagline: plan.tagline,
        roles: plan.roles,
        screens,
      }
    },
    validate: (spec) => validateAppSpec(spec, blueprint),
  })

  return { spec: result.value, needsHumanReview: result.needsHumanReview, violations: result.violations }
}
