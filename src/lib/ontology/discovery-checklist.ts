/**
 * The discovery checklist.
 *
 * Thirty questions across eight dimensions that a consulting discovery has to
 * answer before anyone can responsibly quote a fixed price. Every one of them
 * has, in real engagements, been the thing nobody asked.
 *
 * This is a FIXED rubric, deliberately. Asking a model "what's missing?" gives a
 * different, plausible-sounding answer every run and quietly drifts toward
 * whatever the corpus happens to discuss. Scoring a fixed list makes coverage
 * comparable between runs and between engagements, and makes an absent
 * dimension impossible to overlook — the row is there whether the sources
 * mention it or not.
 *
 * `whyItMatters` is shown in the UI and fed to the model, because a question
 * without its consequence reads as bureaucracy and gets skipped.
 */

export type GapDimension =
  | 'Users & Roles'
  | 'Process & Volume'
  | 'Data'
  | 'Integrations'
  | 'Non-functional'
  | 'Compliance'
  | 'Commercial'
  | 'Delivery'

export const GAP_DIMENSIONS: readonly GapDimension[] = [
  'Users & Roles',
  'Process & Volume',
  'Data',
  'Integrations',
  'Non-functional',
  'Compliance',
  'Commercial',
  'Delivery',
]

export type GapQuestion = {
  id: string
  dimension: GapDimension
  question: string
  whyItMatters: string
}

export const DISCOVERY_CHECKLIST: readonly GapQuestion[] = [
  // ---- Users & Roles -------------------------------------------------------
  {
    id: 'UR1',
    dimension: 'Users & Roles',
    question: 'What are the distinct user roles, and how many people are in each?',
    whyItMatters: 'Drives permissions, licence cost and the number of screens. A wrong headcount resets the commercials.',
  },
  {
    id: 'UR2',
    dimension: 'Users & Roles',
    question: 'Who owns this process today, and who signs off on changing it?',
    whyItMatters: 'Without a named owner, decisions bounce and the project stalls in week two.',
  },
  {
    id: 'UR3',
    dimension: 'Users & Roles',
    question: 'Which users are internal staff and which are external customers or partners?',
    whyItMatters: 'External users change the authentication model, the support burden and the security review.',
  },
  {
    id: 'UR4',
    dimension: 'Users & Roles',
    question: 'What is the working context of each role — desk, warehouse floor, mobile, offline?',
    whyItMatters: 'A warehouse user on a handheld needs a different application than an analyst on two monitors.',
  },

  // ---- Process & Volume ----------------------------------------------------
  {
    id: 'PV1',
    dimension: 'Process & Volume',
    question: 'What is the end-to-end process today, step by step, including who does each step?',
    whyItMatters: 'You cannot improve a process you have only heard summarised.',
  },
  {
    id: 'PV2',
    dimension: 'Process & Volume',
    question: 'What volume does the process handle per day or month, and how seasonal is it?',
    whyItMatters: 'Peak volume, not average, decides the architecture and the go-live window.',
  },
  {
    id: 'PV3',
    dimension: 'Process & Volume',
    question: 'Where does work currently queue, stall, or get reworked?',
    whyItMatters: 'This is where the savings are. Automating a step that was never the bottleneck changes nothing.',
  },
  {
    id: 'PV4',
    dimension: 'Process & Volume',
    question: 'What are the exception paths, and how often does each one fire?',
    whyItMatters: 'Exceptions are usually most of the work and almost never mentioned in the first meeting.',
  },

  // ---- Data ----------------------------------------------------------------
  {
    id: 'DA1',
    dimension: 'Data',
    question: 'What are the core business entities and their key fields?',
    whyItMatters: 'The data model is the part that is expensive to change after build starts.',
  },
  {
    id: 'DA2',
    dimension: 'Data',
    question: 'Where does the data live today, and which system is the system of record?',
    whyItMatters: 'Two systems both believing they are authoritative is the most common root cause of "the numbers are wrong".',
  },
  {
    id: 'DA3',
    dimension: 'Data',
    question: 'What historical data must be migrated, and what condition is it in?',
    whyItMatters: 'Migration is routinely underestimated by an order of magnitude and it blocks go-live.',
  },
  {
    id: 'DA4',
    dimension: 'Data',
    question: 'What reporting or analytics is needed, by whom, and how often?',
    whyItMatters: 'Reporting requirements discovered late force schema changes after the data model is fixed.',
  },

  // ---- Integrations --------------------------------------------------------
  {
    id: 'IN1',
    dimension: 'Integrations',
    question: 'Which existing systems must the solution exchange data with?',
    whyItMatters: 'Every integration is a dependency on somebody else’s roadmap and somebody else’s availability.',
  },
  {
    id: 'IN2',
    dimension: 'Integrations',
    question: 'What integration mechanism does each system actually offer — API, file drop, EDI, direct database?',
    whyItMatters: '"It has an API" and "it has a documented, credentialed, rate-limited API we can get access to" are different projects.',
  },
  {
    id: 'IN3',
    dimension: 'Integrations',
    question: 'For each integration, what direction and latency is required — real-time, near-real-time, or batch?',
    whyItMatters: 'Real-time turns a nightly file into a queue, a retry policy and an on-call rota.',
  },
  {
    id: 'IN4',
    dimension: 'Integrations',
    question: 'Who owns each upstream and downstream system, and can they make changes for us?',
    whyItMatters: 'A third-party vendor who will not change their export is a hard constraint, not a negotiation.',
  },

  // ---- Non-functional ------------------------------------------------------
  {
    id: 'NF1',
    dimension: 'Non-functional',
    question: 'What availability and response times are expected, and is there a contractual SLA?',
    whyItMatters: 'Four nines costs several times what two nines costs and is decided by architecture, not by effort.',
  },
  {
    id: 'NF2',
    dimension: 'Non-functional',
    question: 'How will users authenticate — is SSO required, and against which directory?',
    whyItMatters: 'SSO is a small task if planned and a launch blocker if discovered in UAT.',
  },
  {
    id: 'NF3',
    dimension: 'Non-functional',
    question: 'What concurrency and growth is expected over the next 24 months?',
    whyItMatters: 'Designing for today’s volume is how a successful pilot becomes an emergency rebuild.',
  },
  {
    id: 'NF4',
    dimension: 'Non-functional',
    question: 'What accessibility standard and which languages must be supported?',
    whyItMatters: 'Retrofitting accessibility or localisation costs far more than building it in, and may be a legal requirement.',
  },

  // ---- Compliance ----------------------------------------------------------
  {
    id: 'CO1',
    dimension: 'Compliance',
    question: 'Where must data be stored and processed, and under which regulations?',
    whyItMatters: 'Data residency decides the hosting region and can rule out an entire platform choice.',
  },
  {
    id: 'CO2',
    dimension: 'Compliance',
    question: 'What personal or commercially sensitive data is involved, and what retention rules apply?',
    whyItMatters: 'Determines encryption, access control, deletion workflows and whether a DPIA is needed.',
  },
  {
    id: 'CO3',
    dimension: 'Compliance',
    question: 'What audit trail is required — who changed what, when, and can it be proven?',
    whyItMatters: 'Audit requirements are cheap to design in and near-impossible to backfill for historical records.',
  },
  {
    id: 'CO4',
    dimension: 'Compliance',
    question: 'What internal security review, certification or procurement gate must be cleared?',
    whyItMatters: 'These gates have their own calendars and routinely add weeks nobody put in the plan.',
  },

  // ---- Commercial ----------------------------------------------------------
  {
    id: 'CM1',
    dimension: 'Commercial',
    question: 'What is the budget envelope, and who approves it?',
    whyItMatters: 'Scope without a budget produces a proposal that is declined politely and slowly.',
  },
  {
    id: 'CM2',
    dimension: 'Commercial',
    question: 'What does the current process cost — in hours, errors, or lost business?',
    whyItMatters: 'This is the number that justifies the project. Without it there is no business case, only a wish.',
  },
  {
    id: 'CM3',
    dimension: 'Commercial',
    question: 'What does success look like measurably, and who declares it achieved?',
    whyItMatters: 'Undefined success means the project never formally finishes and never gets paid in full.',
  },

  // ---- Delivery ------------------------------------------------------------
  {
    id: 'DE1',
    dimension: 'Delivery',
    question: 'What is the required go-live date, and what real event drives it?',
    whyItMatters: 'A date driven by peak season is immovable; a date driven by preference is negotiable. They look identical in a meeting.',
  },
  {
    id: 'DE2',
    dimension: 'Delivery',
    question: 'Who on the client side is available to the project, and for how much of their time?',
    whyItMatters: 'Client availability is the most common cause of slipped delivery and is rarely stated up front.',
  },
  {
    id: 'DE3',
    dimension: 'Delivery',
    question: 'What is the rollout approach — big bang, pilot site, or phased by user group?',
    whyItMatters: 'Decides whether the old and new processes must run in parallel, which roughly doubles the scope.',
  },
]

export const CHECKLIST_BY_ID: Record<string, GapQuestion> = Object.fromEntries(
  DISCOVERY_CHECKLIST.map((q) => [q.id, q]),
)
