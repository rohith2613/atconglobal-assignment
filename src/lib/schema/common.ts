import { z } from 'zod'
import type { JsonSchema, SchemaSpec } from '../llm/types'

/**
 * Every claim the system makes must point at evidence that exists and quote
 * text that is really in it. Both halves are checked by the Tier-1 validators;
 * this type is what makes the check possible at all.
 */
export const Citation = z.object({
  evidenceIds: z.array(z.string()).min(1),
  quote: z.string().min(3),
})
export type Citation = z.infer<typeof Citation>

type Def = { typeName: string; [k: string]: unknown }
const defOf = (s: z.ZodTypeAny): Def => (s as unknown as { _def: Def })._def

/**
 * Zod → OpenAI strict JSON Schema.
 *
 * Deliberately emits only the keywords strict mode accepts: `type`,
 * `properties`, `required`, `additionalProperties`, `items`, `enum`, `anyOf`,
 * `description`. Constraints like `.min(1)` on an array or `.min(3)` on a
 * string are dropped here and enforced by re-parsing the response with the same
 * Zod schema in-process. That two-pass arrangement is the reason both exist:
 * the API guarantees the shape, Zod guarantees the substance.
 *
 * Property order is preserved from the Zod declaration. This is load-bearing —
 * the critic schema depends on `reasoning` being generated before `verdict`.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = defOf(schema)

  switch (def.typeName) {
    case 'ZodString':
      return { type: 'string' }
    case 'ZodNumber':
      return { type: 'number' }
    case 'ZodBoolean':
      return { type: 'boolean' }

    case 'ZodLiteral': {
      const v = def.value
      return { type: typeof v === 'number' ? 'number' : 'string', enum: [v] }
    }

    case 'ZodEnum':
      return { type: 'string', enum: def.values as string[] }

    case 'ZodNativeEnum':
      return { type: 'string', enum: Object.values(def.values as object) }

    case 'ZodArray':
      return { type: 'array', items: zodToJsonSchema(def.type as z.ZodTypeAny) }

    case 'ZodObject': {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)()
      const properties: Record<string, JsonSchema> = {}
      // Strict mode requires EVERY key in `required`. Optionality is expressed
      // as a nullable type instead, handled by the ZodOptional case below.
      const required: string[] = []
      for (const key of Object.keys(shape)) {
        properties[key] = zodToJsonSchema(shape[key])
        required.push(key)
      }
      return { type: 'object', properties, required, additionalProperties: false }
    }

    case 'ZodNullable':
    case 'ZodOptional': {
      const inner = zodToJsonSchema(def.innerType as z.ZodTypeAny)
      const t = inner.type
      if (typeof t === 'string') return { ...inner, type: [t, 'null'] }
      return { anyOf: [inner, { type: 'null' }] }
    }

    case 'ZodDefault':
      return zodToJsonSchema(def.innerType as z.ZodTypeAny)

    case 'ZodEffects':
      return zodToJsonSchema(def.schema as z.ZodTypeAny)

    case 'ZodDiscriminatedUnion':
    case 'ZodUnion': {
      const options = (def.options as z.ZodTypeAny[]) ?? []
      return { anyOf: options.map(zodToJsonSchema) }
    }

    case 'ZodRecord':
      return { type: 'object', additionalProperties: zodToJsonSchema(def.valueType as z.ZodTypeAny) }

    case 'ZodAny':
    case 'ZodUnknown':
      return {}

    default:
      throw new Error(
        `zodToJsonSchema does not handle ${def.typeName}. Add a case or express ` +
          `the field with a type strict mode supports.`,
      )
  }
}

/** Bundles the name, the Zod validator and the JSON Schema an API call needs. */
export function spec<T>(name: string, zod: z.ZodType<T>): SchemaSpec<T> {
  return { name, zod, json: zodToJsonSchema(zod as unknown as z.ZodTypeAny) }
}
