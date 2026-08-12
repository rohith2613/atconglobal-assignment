import { z } from 'zod'
import type { LlmClient } from '../llm/types'
import { spec } from '../schema/common'
import { buildDisplayText, type RawSource, type Segment } from './types'

/**
 * A screenshot of the client's current application is evidence about the
 * process, not a design to copy. The extraction is deliberately shaped around
 * "what does this tell me about how they work today" — the fields they capture,
 * the states they track, the friction visible in the layout.
 */
const ScreenReading = z.object({
  screenName: z.string(),
  purpose: z.string(),
  primaryActor: z.string(),
  visibleFields: z.array(z.string()),
  visibleActions: z.array(z.string()),
  dataShown: z.array(z.string()),
  workflowObservations: z.array(z.string()),
  frictionSignals: z.array(z.string()),
})
type ScreenReading = z.infer<typeof ScreenReading>

const SCREEN_SPEC = spec('screen_reading', ScreenReading)

const SYSTEM = `You are a business analyst examining a screenshot of a client's EXISTING application during a discovery phase. Your job is to read the process off the screen.

Report only what is visibly present. Do not invent field names, do not guess at features that are not shown, and do not propose improvements — a later stage does that.

workflowObservations: what the screen tells you about the order of work, who does what, and what is waiting on whom. Read the CONTENT, not just the widgets — folder names, counts, statuses, dates, notes and subject lines are usually more revealing than the layout.

frictionSignals: concrete visible evidence that this process is painful. Quote or name the specific thing you can see. Look hard for these — a screen a consultant was sent during discovery almost always contains several. Examples of what counts:
- a general-purpose tool doing a business system's job (email folders used as a work queue, a spreadsheet used as a database, a notes box used to track status)
- work visibly waiting on one person or one step, especially with a count attached
- the same information appearing in two places, or re-keyed between systems
- ad-hoc conventions that only work because someone remembers them: naming schemes, "do not use" markers, colour codes, version numbers in filenames
- staleness or distrust of the data on screen: out-of-date warnings, overridden values, manual corrections
- chasing and rework: repeated follow-ups, escalations, duplicated threads
- fields that are free text where structured data plainly belongs
- counts, backlogs or queues that look unmanaged

Only report what you can actually see. If a screen genuinely shows a clean, well-supported process, return an empty list — but say so in workflowObservations rather than leaving both empty.`

export async function parseScreenshot(
  name: string,
  buffer: Buffer,
  mime: string,
  llm: LlmClient,
  ctx: { runId: string; engagementId: string },
): Promise<RawSource> {
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`

  const { data } = await llm.complete<ScreenReading>({
    role: 'vision',
    stage: 'ingest',
    runId: ctx.runId,
    engagementId: ctx.engagementId,
    system: SYSTEM,
    user: `Screenshot filename: ${name}. Read this screen of the client's current application.`,
    schema: SCREEN_SPEC,
    images: [dataUri],
    summary: `read screenshot ${name}`,
  })

  const segments: Segment[] = []
  const push = (label: string, text: string) => {
    if (text.trim().length > 2) segments.push({ locator: `${data.screenName} · ${label}`, text: text.trim() })
  }

  push('purpose', `${data.purpose} Primary user: ${data.primaryActor}.`)
  if (data.visibleFields.length) push('fields on screen', data.visibleFields.join(', '))
  if (data.visibleActions.length) push('actions available', data.visibleActions.join(', '))
  if (data.dataShown.length) push('data displayed', data.dataShown.join(', '))
  data.workflowObservations.forEach((o, i) => push(`workflow observation ${i + 1}`, o))
  data.frictionSignals.forEach((f, i) => push(`friction signal ${i + 1}`, f))

  return {
    type: 'screenshot',
    name,
    text: buildDisplayText(segments),
    segments,
    meta: {
      screenName: data.screenName,
      fields: data.visibleFields.length,
      frictionSignals: data.frictionSignals.length,
    },
  }
}
