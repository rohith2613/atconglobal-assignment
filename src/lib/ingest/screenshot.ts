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

const SYSTEM = `You are a business analyst examining a screenshot of a client's EXISTING application during a discovery phase.

Report only what is visibly present. Do not invent field names, do not guess at features that are not shown, and do not propose improvements — a later stage does that.

frictionSignals: note concrete evidence of a painful process. Free-text fields where structured data belongs, statuses tracked in a comment box, obvious duplicate data entry, a spreadsheet embedded in a business application, manual reference numbers. If you see none, return an empty list rather than inventing one.

workflowObservations: what the screen tells you about the order of work and who does what.`

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
