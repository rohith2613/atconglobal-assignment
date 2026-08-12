/**
 * Renders the binary parts of the Nordwind corpus from their committed text
 * sources: the SOP PDF, three legacy-application screenshots, and a real spoken
 * call recording.
 *
 * The outputs are committed, so nobody needs to run this to use the project.
 * It exists so the corpus is reproducible rather than a set of mystery binaries,
 * and so the audio is genuinely audio — the Whisper path in the ingest layer is
 * exercised by a real mp3, not stubbed.
 *
 * Run: npm run fixtures        (needs OPENAI_API_KEY only for the audio step)
 */
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import OpenAI from 'openai'

const DIR = resolve('fixtures/nordwind')
const SRC = join(DIR, '_source')

// ---------------------------------------------------------------------------
// 1. SOP markdown → PDF
// ---------------------------------------------------------------------------

type Line = { text: string; size: number; bold: boolean; gapBefore: number }

/** Enough markdown for a procedure document: headings, paragraphs, wrapping. */
function layout(md: string, width: number, font: { widthOfTextAtSize(t: string, s: number): number }, bold: { widthOfTextAtSize(t: string, s: number): number }): Line[] {
  const out: Line[] = []

  const wrap = (text: string, size: number, isBold: boolean, gapBefore: number) => {
    const measure = isBold ? bold : font
    const words = text.split(/\s+/)
    let line = ''
    let first = true
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w
      if (measure.widthOfTextAtSize(candidate, size) > width && line) {
        out.push({ text: line, size, bold: isBold, gapBefore: first ? gapBefore : 0 })
        first = false
        line = w
      } else {
        line = candidate
      }
    }
    if (line) out.push({ text: line, size, bold: isBold, gapBefore: first ? gapBefore : 0 })
  }

  for (const raw of md.split('\n')) {
    const l = raw.trim()
    if (!l) continue
    const h = /^(#{1,6})\s+(.*)$/.exec(l)
    if (h) {
      const level = h[1].length
      const size = level === 1 ? 18 : level === 2 ? 13 : 11
      wrap(h[2], size, true, level === 1 ? 0 : level === 2 ? 18 : 12)
    } else {
      wrap(l.replace(/\*\*/g, ''), 10, false, 8)
    }
  }
  return out
}

async function makePdf(): Promise<void> {
  const md = readFileSync(join(SRC, 'quotation-sop.md'), 'utf8')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const W = 595.28
  const H = 841.89
  const M = 62
  const textWidth = W - M * 2

  const lines = layout(md, textWidth, font, bold)

  let page = pdf.addPage([W, H])
  let y = H - M
  let pageNo = 1

  const footer = () => {
    page.drawText(`QMS-04 v3.2  ·  Nordwind Logistics AS  ·  page ${pageNo}`, {
      x: M,
      y: 34,
      size: 8,
      font,
      color: rgb(0.45, 0.45, 0.45),
    })
  }

  for (const line of lines) {
    y -= line.gapBefore
    const lead = line.size * 1.45
    if (y - lead < M + 20) {
      footer()
      page = pdf.addPage([W, H])
      pageNo += 1
      y = H - M
    }
    y -= lead
    page.drawText(line.text, {
      x: M,
      y,
      size: line.size,
      font: line.bold ? bold : font,
      color: line.size >= 13 ? rgb(0.08, 0.12, 0.2) : rgb(0.1, 0.1, 0.1),
    })
  }
  footer()

  pdf.setTitle('Quotation Handling — QMS-04 v3.2')
  pdf.setAuthor('Nordwind Logistics AS')
  pdf.setSubject('Standard Operating Procedure')

  writeFileSync(join(DIR, 'quotation-sop-v3.2.pdf'), await pdf.save())
  console.log(`  quotation-sop-v3.2.pdf   ${pageNo} pages`)
}

// ---------------------------------------------------------------------------
// 2. HTML → PNG via whatever Chrome is already installed
// ---------------------------------------------------------------------------

const CHROME_CANDIDATES = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

function findChrome(): string | null {
  return CHROME_CANDIDATES.find((p) => p && existsSync(p)) ?? null
}

const SHOTS = [
  // Heights are trimmed to the rendered content. Blank canvas is not free —
  // the vision model spends attention on it and the demo looks sloppy.
  { src: 'screen-1-nordquote.html', out: 'screen-1-nordquote-quotation-entry.png', w: 1100, h: 525 },
  { src: 'screen-2-ratesheet.html', out: 'screen-2-carrier-rate-sheet.png', w: 1180, h: 560 },
  { src: 'screen-3-mailbox.html', out: 'screen-3-shared-quotes-mailbox.png', w: 1240, h: 745 },
]

function makeScreenshots(): void {
  const chrome = findChrome()
  if (!chrome) {
    console.log('  screenshots              SKIPPED — no Chrome found (committed PNGs are used)')
    return
  }

  for (const s of SHOTS) {
    const profile = join(tmpdir(), `prism-shot-${Date.now()}-${s.out}`)
    try {
      execFileSync(
        chrome,
        [
          '--headless=new',
          '--disable-gpu',
          '--hide-scrollbars',
          '--force-device-scale-factor=2',
          `--user-data-dir=${profile}`,
          `--window-size=${s.w},${s.h}`,
          `--screenshot=${join(DIR, s.out)}`,
          `file:///${join(SRC, s.src).replace(/\\/g, '/')}`,
        ],
        { stdio: 'pipe', timeout: 60_000 },
      )
      console.log(`  ${s.out.padEnd(40)} ${s.w}×${s.h} @2x`)
    } catch (e) {
      console.log(`  ${s.out.padEnd(40)} FAILED: ${e instanceof Error ? e.message.slice(0, 90) : e}`)
    } finally {
      rmSync(profile, { recursive: true, force: true })
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Call script → spoken mp3
// ---------------------------------------------------------------------------

async function makeAudio(): Promise<void> {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    console.log('  call-with-erik.mp3       SKIPPED — no OPENAI_API_KEY (committed mp3 is used)')
    return
  }

  const script = readFileSync(join(SRC, 'call-script.txt'), 'utf8').trim()
  const client = new OpenAI({ apiKey: key })

  const res = await client.audio.speech.create({
    model: 'tts-1',
    // "onyx" reads as an older man on a phone, which is what this is.
    voice: 'onyx',
    input: script,
    speed: 0.96,
    response_format: 'mp3',
  })

  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(join(DIR, 'call-with-erik.mp3'), buf)
  console.log(`  call-with-erik.mp3       ${(buf.length / 1024).toFixed(0)} KB, ${script.length} chars spoken`)
}

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(DIR, { recursive: true })
  console.log('Building Nordwind fixture binaries from committed sources:\n')
  await makePdf()
  makeScreenshots()
  await makeAudio()
  console.log('\nDone.')
}

void main()
