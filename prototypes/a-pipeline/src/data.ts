import type { Application, Check, Feed, Job, Profile, Route, Setup, Stage } from "./types"

// Example data for the prototype. Companies are real names used as plausible
// examples only; nothing here comes from a live account.

const H = 3_600_000
const D = 24 * H
export const now = () => Date.now()

type Seed = {
  id: string
  feeds: string[]
  title: string
  company: string
  tint: string
  location: string
  setup: Setup
  salary?: [number, number]
  source: string
  route: Route
  posted: number
  match: number
  matched: string[]
  missing?: string[]
  stage?: Stage
  fresh?: boolean
  app?: Partial<Application>
  checks?: Check[]
}

const ABOUT: Record<string, string> = {
  Deel: "Deel runs payroll and compliance for remote teams in 150 countries.",
  Careem: "Careem is the everything app for the Middle East: rides, food, payments.",
  N26: "N26 is a mobile bank with 8 million customers across Europe.",
  Vercel: "Vercel builds the frontend cloud and the Next.js framework.",
  Paymob: "Paymob powers online and in-store payments for 300k merchants in MENA.",
  Toptal: "Toptal connects companies with the top 3% of freelance engineers.",
  Talabat: "Talabat is the region's largest food and grocery delivery platform.",
  GitLab: "GitLab is the all-remote company behind the DevSecOps platform.",
  Revolut: "Revolut is a global financial super-app with 45 million customers.",
  Noon: "Noon is the Middle East's homegrown e-commerce marketplace.",
  Zalando: "Zalando is Europe's leading online fashion and lifestyle platform.",
  Fawry: "Fawry is Egypt's largest e-payments network.",
  Tabby: "Tabby is a buy-now-pay-later fintech serving Saudi Arabia and the UAE.",
  Remote: "Remote.com helps companies hire and pay people anywhere.",
  Delivery: "Delivery Hero runs local delivery brands in 70 countries.",
  Trivago: "Trivago compares hotel prices from hundreds of booking sites.",
  Swvl: "Swvl runs shared bus and van transit in emerging cities.",
  Anghami: "Anghami is the leading music streaming platform in MENA.",
  Instabug: "Instabug gives mobile teams bug reports and performance monitoring.",
  Kraken: "Kraken is one of the longest-running crypto exchanges.",
}

const DUTIES = [
  "Design and build APIs in Node.js and TypeScript used by millions of requests a day",
  "Own services end to end: design, code review, deploys, on-call",
  "Model data in PostgreSQL and tune queries that run hot",
  "Work with product and mobile engineers to ship features each sprint",
  "Improve reliability: tracing, alerting, and load testing",
]

function checksFor(s: Seed): Check[] {
  if (s.checks) return s.checks
  const out: Check[] = [{ state: "ok", text: "4+ years building backend services (you have 5)" }]
  out.push(s.setup === "Remote" ? { state: "ok", text: "Remote: matches what you asked for" } : s.location.includes("Cairo") ? { state: "ok", text: "In Cairo, where you live" } : { state: "warn", text: `${s.setup} in ${s.location.split(",")[0]}: you would need to relocate` })
  out.push(s.salary ? (s.salary[1] >= 5000 ? { state: "ok", text: `Pays up to $${(s.salary[1] / 1000).toFixed(1)}k / month, above your $4.5k minimum` } : { state: "warn", text: `Pays up to $${(s.salary[1] / 1000).toFixed(1)}k / month, below your $4.5k minimum` }) : { state: "warn", text: "Salary not listed" })
  if (s.missing?.length) out.push({ state: "warn", text: `Asks for ${s.missing.join(", ")}, which is not on your profile` })
  return out
}

const SEEDS: Seed[] = [
  // ---- Remote backend roles (f1)
  { id: "j1", feeds: ["f1"], title: "Senior Backend Engineer", company: "Deel", tint: "#0E1B2C", location: "Remote, worldwide", setup: "Remote", salary: [5500, 7500], source: "Workable", route: "plato", posted: 1, match: 96, matched: ["Node.js", "TypeScript", "PostgreSQL", "AWS", "Payments"], fresh: true },
  { id: "j2", feeds: ["f1"], title: "Backend Engineer, Platform", company: "GitLab", tint: "#E24329", location: "Remote, EMEA", setup: "Remote", salary: [5000, 6800], source: "Greenhouse", route: "plato", posted: 2, match: 91, matched: ["Node.js", "PostgreSQL", "Redis", "Docker"], missing: ["Go"], fresh: true },
  { id: "j3", feeds: ["f1"], title: "Senior Node.js Engineer", company: "Toptal", tint: "#204ECF", location: "Remote, worldwide", setup: "Remote", source: "Lever", route: "plato", posted: 3, match: 88, matched: ["Node.js", "NestJS", "TypeScript", "MongoDB"], fresh: true },
  { id: "j4", feeds: ["f1"], title: "Staff Backend Engineer", company: "Vercel", tint: "#111111", location: "Remote, EMEA", setup: "Remote", salary: [8000, 11000], source: "Ashby", route: "plato", posted: 2, match: 84, matched: ["Node.js", "TypeScript", "AWS"], missing: ["Rust", "8+ years"], fresh: true },
  { id: "j5", feeds: ["f1"], title: "Backend Engineer (Payments)", company: "Revolut", tint: "#191C1F", location: "Remote, EMEA", setup: "Remote", salary: [4800, 6500], source: "Lever", route: "plato", posted: 4, match: 86, matched: ["Payments", "PostgreSQL", "Kafka"], missing: ["Java"] },
  { id: "j6", feeds: ["f1"], title: "Software Engineer, APIs", company: "Remote", tint: "#3B5BDB", location: "Remote, worldwide", setup: "Remote", salary: [4500, 6000], source: "Greenhouse", route: "plato", posted: 5, match: 82, matched: ["Node.js", "GraphQL", "PostgreSQL"] },
  { id: "j7", feeds: ["f1"], title: "Senior Backend Engineer", company: "Kraken", tint: "#5741D9", location: "Remote, worldwide", setup: "Remote", salary: [6000, 8500], source: "Ashby", route: "plato", posted: 6, match: 79, matched: ["TypeScript", "PostgreSQL", "Redis"], missing: ["Rust"] },
  { id: "j8", feeds: ["f1"], title: "Backend Engineer", company: "Instabug", tint: "#1D82DC", location: "Remote, Egypt", setup: "Remote", salary: [3200, 4200], source: "Wuzzuf", route: "manual", posted: 3, match: 77, matched: ["Node.js", "MongoDB", "Kafka"] },
  { id: "j18", feeds: ["f1"], title: "Backend Engineer, Core API", company: "Remote", tint: "#3B5BDB", location: "Remote, EMEA", setup: "Remote", salary: [4800, 6200], source: "Lever", route: "plato", posted: 6, match: 83, matched: ["Node.js", "TypeScript"] },
  { id: "j19", feeds: ["f1"], title: "Senior Software Engineer, Payments", company: "Swvl", tint: "#FF4D4D", location: "Remote, EMEA", setup: "Remote", salary: [5000, 6500], source: "LinkedIn", route: "chrome", posted: 1, match: 89, matched: ["Payments", "NestJS", "PostgreSQL"], fresh: true },
  { id: "j20", feeds: ["f1", "f2"], title: "Node.js Engineer", company: "Anghami", tint: "#A020F0", location: "Remote, MENA", setup: "Remote", salary: [4200, 5600], source: "Greenhouse", route: "plato", posted: 2, match: 85, matched: ["Node.js", "Redis", "MongoDB"] },
  // ---- Senior Node.js in Dubai (f2)
  { id: "j9", feeds: ["f2"], title: "Senior Backend Engineer (Node.js)", company: "Careem", tint: "#1DBF73", location: "Dubai, UAE", setup: "Hybrid", salary: [7000, 9500], source: "LinkedIn", route: "chrome", posted: 2, match: 93, matched: ["Node.js", "NestJS", "PostgreSQL", "Redis"], fresh: true },
  { id: "j10", feeds: ["f2"], title: "Senior Software Engineer", company: "Tabby", tint: "#3BFFC1", location: "Dubai, UAE", setup: "Hybrid", salary: [7500, 10000], source: "Greenhouse", route: "plato", posted: 1, match: 90, matched: ["Payments", "TypeScript", "PostgreSQL"], fresh: true },
  { id: "j11", feeds: ["f2"], title: "Staff Backend Engineer", company: "Noon", tint: "#FEEE00", location: "Dubai, UAE", setup: "Hybrid", salary: [9000, 12000], source: "Bayt", route: "manual", posted: 4, match: 81, matched: ["Node.js", "MongoDB", "AWS"], missing: ["Team lead experience"] },
  { id: "j12", feeds: ["f2"], title: "Senior NestJS Engineer", company: "Talabat", tint: "#FF5A00", location: "Dubai, UAE", setup: "On-site", salary: [6500, 8500], source: "Indeed", route: "plato", posted: 5, match: 85, matched: ["NestJS", "TypeScript", "Redis"] },
  { id: "j13", feeds: ["f2"], title: "Backend Engineer, Growth", company: "Anghami", tint: "#A020F0", location: "Abu Dhabi, UAE", setup: "Hybrid", salary: [5500, 7000], source: "LinkedIn", route: "chrome", posted: 6, match: 74, matched: ["Node.js", "Redis"], missing: ["Python"] },
  // ---- Berlin platform engineering (f3)
  { id: "j14", feeds: ["f3"], title: "Senior Software Engineer, Platform", company: "N26", tint: "#36A18B", location: "Berlin, Germany", setup: "Hybrid", salary: [6500, 8000], source: "Greenhouse", route: "plato", posted: 3, match: 87, matched: ["Node.js", "AWS", "Docker", "PostgreSQL"] },
  { id: "j15", feeds: ["f3"], title: "Backend Engineer (Node.js)", company: "Zalando", tint: "#FF6900", location: "Berlin, Germany", setup: "Hybrid", salary: [5800, 7200], source: "Google Jobs", route: "plato", posted: 5, match: 80, matched: ["Node.js", "TypeScript", "AWS"], missing: ["Kotlin"] },
  { id: "j16", feeds: ["f3"], title: "Platform Engineer", company: "Delivery", tint: "#D61F26", location: "Berlin, Germany", setup: "Hybrid", source: "LinkedIn", route: "chrome", posted: 7, match: 72, matched: ["Docker", "AWS", "Redis"], missing: ["Kubernetes", "Terraform"] },
  { id: "j21", feeds: ["f3"], title: "Senior Backend Engineer, Banking", company: "N26", tint: "#36A18B", location: "Berlin, Germany", setup: "Hybrid", salary: [6000, 7600], source: "Greenhouse", route: "plato", posted: 2, match: 86, matched: ["Payments", "PostgreSQL", "AWS"], fresh: true },
  { id: "j22", feeds: ["f2"], title: "Backend Engineer", company: "Paymob", tint: "#1A4BFF", location: "Dubai, UAE", setup: "Hybrid", salary: [5200, 6800], source: "Wuzzuf", route: "manual", posted: 3, match: 82, matched: ["Payments", "Node.js"] },
  { id: "j17", feeds: ["f3"], title: "Senior Backend Engineer", company: "Trivago", tint: "#007FAD", location: "Düsseldorf, Germany", setup: "Hybrid", salary: [5500, 7000], source: "Workable", route: "plato", posted: 8, match: 70, matched: ["Node.js", "PostgreSQL"], missing: ["PHP"] },
]

// What happened to the jobs the seeker already acted on.
const T = (h: number) => now() - h * H
const PIPE: Record<string, { stage: Stage; app?: Partial<Application>; savedAt?: number }> = {
  j5: { stage: "saved", savedAt: T(30) },
  j6: { stage: "saved", savedAt: T(50) },
  j15: { stage: "saved", savedAt: T(80) },
  j13: { stage: "saved", savedAt: T(26) },
  j3: { stage: "applying", app: { status: "working", step: 2, events: [{ at: T(0.2), text: "Read the posting and checked it against your profile" }, { at: T(0.1), text: "Fit looks strong: 88%. Writing a resume for this job" }] } },
  j7: { stage: "applying", app: { status: "queued", step: 0, willAsk: true, events: [{ at: T(0.05), text: "In line. Plato applies to one job at a time" }] } },
  j12: {
    stage: "needs",
    app: {
      status: "needs",
      step: 3,
      need: {
        kind: "questions",
        questions: [
          { id: "notice", label: "What is your notice period?", kind: "text", draft: "30 days", hint: "Saved to your profile, so Plato won't ask again", saveToProfile: "notice" },
          { id: "onsite", label: "This role is on-site in Dubai, 5 days a week. Are you willing to relocate?", kind: "yesno", hint: "Only for this application" },
        ],
      },
      events: [{ at: T(3), text: "Filled 14 of 16 questions on the form" }, { at: T(3), text: "Stopped: 2 questions only you can answer" }],
    },
  },
  j14: { stage: "needs", app: { status: "needs", step: 4, need: { kind: "verify", site: "Greenhouse" }, events: [{ at: T(5), text: "Filled the whole form and attached your tailored resume" }, { at: T(5), text: "The site asked for a human check before it accepts the application" }] } },
  j11: { stage: "needs", app: { status: "needs", step: 1, need: { kind: "manual", site: "Bayt" }, events: [{ at: T(20), text: "Bayt does not let anyone apply for you. Plato prepared your answers so it takes 2 minutes" }] } },
  j9: { stage: "applied", app: { status: "submitted", step: 5, appliedAt: T(26), interview: true, events: [{ at: T(27), text: "Filled the LinkedIn form in your browser with Plato for Chrome" }, { at: T(26), text: "LinkedIn confirmed: “Your application was sent to Careem”" }, { at: T(2), text: "You marked: got an interview" }] } },
  j1: { stage: "applied", app: { status: "submitted", step: 5, appliedAt: T(20), events: [{ at: T(21), text: "Wrote a resume for this job: 92% keyword match" }, { at: T(20), text: "Workable confirmed: “Thanks for applying to Deel”" }] } },
  j18: { stage: "applied", app: { status: "submitted", step: 5, appliedAt: T(44), events: [{ at: T(45), text: "Answered 9 questions from your profile" }, { at: T(44), text: "Lever confirmed the application" }] } },
  j17: { stage: "closed", app: { status: "skipped", step: 1, reason: "Plato skipped it: the role is mostly PHP and your profile is Node.js. You can still apply.", events: [{ at: T(90), text: "Skipped: core stack doesn't match" }] } },
  j16: { stage: "closed", app: { status: "closed", step: 0, reason: "The posting closed before Plato could apply.", events: [{ at: T(100), text: "Posting no longer accepts applications" }] } },
}

const DEFAULT_APP: Application = { status: "queued", step: 0, events: [], resume: "tailored" }

export function seedJobs(): Job[] {
  return SEEDS.map((s) => {
    const p = PIPE[s.id]
    return {
      id: s.id,
      feedIds: s.feeds,
      title: s.title,
      company: s.company === "Delivery" ? "Delivery Hero" : s.company === "Remote" ? "Remote.com" : s.company,
      tint: s.tint,
      location: s.location,
      setup: s.setup,
      salary: s.salary,
      source: s.source,
      route: s.route,
      postedDays: s.posted,
      match: s.match,
      matched: s.matched,
      missing: s.missing ?? [],
      checks: checksFor(s),
      about: ABOUT[s.company] ?? "",
      duties: DUTIES,
      stage: p?.stage ?? s.stage ?? "new",
      fresh: !p && s.fresh,
      savedAt: p?.savedAt,
      app: p?.app ? { ...DEFAULT_APP, ...p.app } : undefined,
    }
  })
}

// Jobs a new search "finds" while it runs (revealed as each board reports back).
export function poolJobs(feedId: string, title: string, where: string): Job[] {
  const role = title || "Backend Engineer"
  const place = where || "Remote"
  const remote = /remote/i.test(place)
  const rows: [string, string, string, number, Route, string[], string[], [number, number] | undefined][] = [
    ["Swvl", "#FF4D4D", "LinkedIn", 89, "chrome", ["Node.js", "NestJS", "PostgreSQL"], [], [5000, 6500]],
    ["Paymob", "#1A4BFF", "Wuzzuf", 86, "manual", ["Payments", "Node.js", "Redis"], [], [4000, 5200]],
    ["Fawry", "#F7B500", "Indeed", 78, "plato", ["Node.js", "MongoDB"], ["Java"], undefined],
    ["Kraken", "#5741D9", "Ashby", 83, "plato", ["TypeScript", "PostgreSQL"], [], [6000, 8000]],
    ["Tabby", "#3BFFC1", "Greenhouse", 81, "plato", ["Payments", "TypeScript"], ["Go"], [6500, 8500]],
    ["Delivery", "#D61F26", "LinkedIn", 75, "chrome", ["AWS", "Docker"], ["Kubernetes"], undefined],
  ]
  return rows.map(([company, tint, source, match, route, matched, missing, salary], i) => {
    const s: Seed = {
      id: `${feedId}-${i}`,
      feeds: [feedId],
      title: i % 2 ? `Senior ${role}` : role,
      company,
      tint,
      location: remote ? "Remote, EMEA" : `${place}`,
      setup: remote ? "Remote" : "Hybrid",
      salary,
      source,
      route,
      posted: (i % 4) + 1,
      match,
      matched,
      missing,
    }
    return {
      id: s.id,
      feedIds: s.feeds,
      title: s.title,
      company: company === "Delivery" ? "Delivery Hero" : company,
      tint,
      location: s.location,
      setup: s.setup,
      salary,
      source,
      route,
      postedDays: s.posted,
      match,
      matched,
      missing,
      checks: checksFor(s),
      about: ABOUT[company] ?? "",
      duties: DUTIES,
      stage: "new",
      fresh: true,
    } as Job
  })
}

export const SOURCES = ["LinkedIn", "Indeed", "Google Jobs", "Glassdoor", "Greenhouse", "Lever", "Workable", "Ashby", "Wuzzuf", "Bayt"]

export function seedFeeds(): Feed[] {
  return [
    { id: "f1", name: "Remote backend roles", roles: ["Backend Engineer", "Senior Node.js Engineer"], where: ["Remote"], setup: ["Remote"], salaryMin: 4500, alert: "daily", lastRunHours: 6 },
    { id: "f2", name: "Senior Node.js in Dubai", roles: ["Senior Node.js Developer", "Senior Backend Engineer"], where: ["Dubai", "Abu Dhabi"], setup: ["Hybrid", "On-site"], salaryMin: 6000, alert: "daily", lastRunHours: 20 },
    { id: "f3", name: "Berlin platform engineering", roles: ["Platform Engineer", "Backend Engineer"], where: ["Berlin"], setup: ["Hybrid"], alert: "weekly", lastRunHours: 70 },
  ]
}

export function seedProfile(): Profile {
  return {
    name: "Ahmed Hassan",
    email: "ahmed.hassan@example.com",
    phone: "+20 100 123 4567",
    headline: "Senior Backend Engineer · Node.js, NestJS, AWS",
    city: "Cairo, Egypt",
    cv: { file: "Ahmed_Hassan_CV.pdf", updated: "Oct 28", pages: 2 },
    experiences: [
      { id: "e1", title: "Senior Backend Engineer", company: "Swvl", from: "Feb 2023", to: "Present", summary: "Led the payments and booking APIs. Moved 6 services to NestJS and cut p95 latency by 40%." },
      { id: "e2", title: "Backend Engineer", company: "Instabug", from: "Jul 2020", to: "Jan 2023", summary: "Built the crash-report ingestion pipeline handling 2B events a day on Node.js, Kafka and MongoDB." },
    ],
    education: [{ school: "Cairo University", degree: "BSc Computer Engineering", years: "2015 – 2020" }],
    certs: [{ name: "AWS Certified Developer – Associate", issuer: "Amazon Web Services", year: "2022" }],
    languages: [
      { name: "Arabic", level: "Native" },
      { name: "English", level: "Fluent" },
    ],
    skills: [
      { name: "Node.js", level: "Strong", proof: "5 years · Swvl, Instabug" },
      { name: "NestJS", level: "Strong", proof: "Migrated 6 services at Swvl" },
      { name: "TypeScript", level: "Strong" },
      { name: "PostgreSQL", level: "Strong" },
      { name: "MongoDB", level: "Working" },
      { name: "Redis", level: "Working" },
      { name: "AWS", level: "Working", proof: "AWS Certified Developer" },
      { name: "Docker", level: "Working" },
      { name: "Kafka", level: "Working" },
      { name: "GraphQL", level: "Learning" },
    ],
    projects: [{ name: "Open-source rate limiter", what: "A Redis-backed rate limiter for NestJS, 1.2k GitHub stars", result: "Used in production by 40+ companies" }],
    prefs: { roles: ["Backend Engineer", "Senior Node.js Engineer", "Platform Engineer"], where: ["Remote", "Dubai", "Berlin"], setup: ["Remote", "Hybrid"], salaryMin: 4500, salaryMax: 7000, types: ["Full-time"], avoid: "Crypto gambling, PHP-only roles" },
    facts: { notice: "", workAuth: "Egypt (citizen). Needs sponsorship elsewhere", linkedin: "linkedin.com/in/ahmed-hassan", github: "github.com/ahmedh", portfolio: "", relocate: "Yes, to UAE or Germany", sponsorship: "Yes, outside Egypt", currentSalary: "" },
    connections: { chrome: false, email: true, digest: "daily" },
  }
}

export const H_MS = H
export const D_MS = D
