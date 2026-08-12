import { z } from 'zod'
import { spec } from './common'

/**
 * The generated POC, expressed as data rather than as code.
 *
 * The model does not write React. It fills in this schema, and a deterministic
 * renderer draws it. That choice is the whole design:
 *
 *   - it always renders — there is no generated syntax error class at all
 *   - nothing generated is ever executed
 *   - the output is diffable, versionable and reviewable as a document
 *   - the component vocabulary is fixed, so the result looks designed rather
 *     than like eight different people's idea of a table
 *
 * Free-form codegen produces a better demo on a good run and nothing at all on
 * a bad one. For a POC a client is going to look at, reliably fine beats
 * occasionally excellent.
 */

const StatRow = z.object({
  kind: z.literal('statRow'),
  stats: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        /** e.g. "-38% vs today". Null when there is nothing honest to compare. */
        delta: z.string().nullable(),
      }),
    )
    .min(2),
})

const TableBlock = z.object({
  kind: z.literal('table'),
  title: z.string(),
  columns: z.array(z.string()).min(2),
  rows: z.array(z.array(z.string())).min(1),
  /** Column index whose cell renders as a status pill, or null. */
  statusColumn: z.number().int().nullable(),
  rowActionLabel: z.string().nullable(),
  /** Screen id to navigate to. Validated against the spec's own screens. */
  rowActionTarget: z.string().nullable(),
})

const FormBlock = z.object({
  kind: z.literal('form'),
  title: z.string(),
  submitLabel: z.string(),
  submitTarget: z.string().nullable(),
  fields: z
    .array(
      z.object({
        label: z.string(),
        type: z.enum(['text', 'number', 'select', 'date', 'textarea', 'checkbox']),
        options: z.array(z.string()),
        placeholder: z.string(),
        required: z.boolean(),
      }),
    )
    .min(1),
})

const KanbanBlock = z.object({
  kind: z.literal('kanban'),
  title: z.string(),
  columns: z
    .array(
      z.object({
        name: z.string(),
        cards: z.array(z.object({ title: z.string(), meta: z.string(), tag: z.string().nullable() })),
      }),
    )
    .min(2),
})

const DetailBlock = z.object({
  kind: z.literal('detail'),
  title: z.string(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })).min(2),
  actions: z.array(z.object({ label: z.string(), target: z.string().nullable() })),
})

const TimelineBlock = z.object({
  kind: z.literal('timeline'),
  title: z.string(),
  events: z.array(z.object({ when: z.string(), what: z.string(), who: z.string() })).min(2),
})

const ChartBlock = z.object({
  kind: z.literal('chart'),
  title: z.string(),
  unit: z.string(),
  series: z.array(z.object({ label: z.string(), value: z.number() })).min(2),
})

const ListBlock = z.object({
  kind: z.literal('list'),
  title: z.string(),
  items: z
    .array(
      z.object({
        primary: z.string(),
        secondary: z.string(),
        badge: z.string().nullable(),
      }),
    )
    .min(1),
})

export const Block = z.discriminatedUnion('kind', [
  StatRow,
  TableBlock,
  FormBlock,
  KanbanBlock,
  DetailBlock,
  TimelineBlock,
  ChartBlock,
  ListBlock,
])
export type Block = z.infer<typeof Block>
export type BlockKind = Block['kind']

export const BLOCK_KINDS: readonly BlockKind[] = [
  'statRow',
  'table',
  'form',
  'kanban',
  'detail',
  'timeline',
  'chart',
  'list',
]

/** Fixed icon vocabulary — free-form icon names produce broken glyphs. */
export const ScreenIcon = z.enum([
  'inbox',
  'file',
  'table',
  'board',
  'chart',
  'clock',
  'user',
  'settings',
  'search',
  'check',
])
export type ScreenIcon = z.infer<typeof ScreenIcon>

export const AppSpec = z.object({
  appName: z.string().min(2),
  tagline: z.string().min(5),
  roles: z.array(z.object({ id: z.string().min(1), name: z.string().min(2) })).min(1),
  screens: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(2),
        icon: ScreenIcon,
        /** Which roles see this screen. Drives the role switcher in the UI. */
        roleIds: z.array(z.string()).min(1),
        blocks: z.array(Block).min(1),
      }),
    )
    .min(2),
})
export type AppSpec = z.infer<typeof AppSpec>
export const APPSPEC_SPEC = spec('app_spec', AppSpec)
