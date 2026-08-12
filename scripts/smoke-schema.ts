/**
 * Sends every schema this project uses to the API to confirm strict mode
 * accepts it. Cheap, and it catches structured-output quirks now rather than
 * three stages later. Run: npx tsx scripts/smoke-schema.ts
 */
import 'dotenv/config'
import OpenAI from 'openai'
import { APPSPEC_SPEC } from '../src/lib/schema/appspec'
import { BRIEF_SPEC } from '../src/lib/schema/brief'
import { BLUEPRINT_SPEC } from '../src/lib/schema/blueprint'
import { CRITIC_SPEC } from '../src/lib/schema/critic'
import { SIGNALS_SPEC, CONFLICTS_SPEC, MERGE_SPEC } from '../src/lib/schema/signals'
import { GAPS_SPEC } from '../src/lib/schema/gaps'

const key = process.env.OPENAI_API_KEY
if (!key) {
  console.error('No OPENAI_API_KEY — nothing to smoke test.')
  process.exit(1)
}

const client = new OpenAI({ apiKey: key })
const specs = [SIGNALS_SPEC, CONFLICTS_SPEC, MERGE_SPEC, GAPS_SPEC, BRIEF_SPEC, BLUEPRINT_SPEC, APPSPEC_SPEC, CRITIC_SPEC]

async function main() {
  let failed = 0
  for (const s of specs) {
    try {
      const r = await client.chat.completions.create({
        model: 'gpt-4.1-mini',
        max_completion_tokens: 4000,
        messages: [
          { role: 'system', content: 'Return a minimal but valid example.' },
          { role: 'user', content: 'Produce one short plausible example object. Keep arrays to one or two entries.' },
        ],
        response_format: { type: 'json_schema', json_schema: { name: s.name, schema: s.json, strict: true } },
      })
      const raw = r.choices[0]?.message.content ?? ''
      const parsed = s.zod.safeParse(JSON.parse(raw))
      console.log(
        `${parsed.success ? 'OK  ' : 'ZOD '} ${s.name.padEnd(20)} api=accepted zod=${parsed.success ? 'pass' : 'FAIL'} tokens=${r.usage?.total_tokens}`,
      )
      if (!parsed.success) {
        failed++
        console.log('     ' + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join(' | '))
      }
    } catch (e) {
      failed++
      console.log(`FAIL ${s.name.padEnd(20)} ${e instanceof Error ? e.message.slice(0, 260) : e}`)
    }
  }

  console.log(failed === 0 ? '\nAll schemas accepted by strict mode.' : `\n${failed} schema(s) need attention.`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
