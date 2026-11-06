import type { Job, Persona, Route, Setup } from "./types"

// Example people and jobs. Company names are used as plausible examples only.

type Row = [title: string, company: string, tint: string, location: string, setup: Setup, salary: [number, number] | undefined, source: string, route: Route, match: number, why: string[], watch: string[]]
const build = (prefix: string, rows: Row[], about: (c: string) => string): Job[] =>
  rows.map(([title, company, tint, location, setup, salary, source, route, match, why, watch], i) => ({ id: `${prefix}${i + 1}`, title, company, tint, location, setup, salary, source, route, postedDays: (i % 6) + 1, match, why, watch, about: about(company) }))

const ABOUT: Record<string, string> = {
  Deel: "Deel runs payroll and compliance for remote teams in 150 countries.",
  GitLab: "GitLab is the all-remote company behind the DevSecOps platform.",
  Toptal: "Toptal connects companies with freelance engineers.",
  Vercel: "Vercel builds the frontend cloud and the Next.js framework.",
  Careem: "Careem is the everything app for the Middle East: rides, food, payments.",
  Tabby: "Tabby is a buy-now-pay-later fintech in Saudi Arabia and the UAE.",
  Talabat: "Talabat is the region's largest food and grocery delivery platform.",
  N26: "N26 is a mobile bank with 8 million customers across Europe.",
  Swvl: "Swvl runs shared bus and van transit in emerging cities.",
  Revolut: "Revolut is a global financial app with 45 million customers.",
  Noon: "Noon is the Middle East's homegrown e-commerce marketplace.",
  Paymob: "Paymob powers online payments for 300k merchants in MENA.",
  Instabug: "Instabug gives mobile teams bug reports and performance monitoring.",
  Anghami: "Anghami is the leading music streaming platform in MENA.",
  "Al Rajhi Bank": "Al Rajhi is one of the largest Islamic banks in the world.",
  Tamara: "Tamara is a Saudi buy-now-pay-later and shopping app.",
  Jahez: "Jahez is a Saudi food delivery platform listed on Tadawul.",
  Almarai: "Almarai is the region's largest food and dairy producer.",
  "PwC Middle East": "PwC Middle East provides audit, tax and advisory services.",
  STC: "stc is Saudi Arabia's largest telecom group.",
  Lean: "Lean Technologies builds open-banking infrastructure for the region.",
  Foodics: "Foodics makes restaurant point-of-sale and back-office software.",
  "Deloitte": "Deloitte provides audit, consulting and tax services.",
  Sary: "Sary is a B2B marketplace for shops and restaurants in Saudi Arabia.",
}
const about = (c: string) => ABOUT[c] ?? `${c} is hiring for this role.`

export const AHMED: Persona = {
  id: "ahmed",
  name: "Ahmed Hassan",
  first: "Ahmed",
  headline: "Senior Backend Engineer",
  city: "Cairo, Egypt",
  email: "ahmed.hassan@example.com",
  cv: "Ahmed_Hassan_CV.pdf",
  currency: "USD",
  years: 5,
  experience: [
    { title: "Senior Backend Engineer", company: "Swvl", years: "2023 – now", did: "Led the payments and booking systems; made them 40% faster." },
    { title: "Backend Engineer", company: "Instabug", years: "2020 – 2023", did: "Built the system that handles 2 billion crash reports a day." },
  ],
  skills: ["Node.js", "NestJS", "TypeScript", "PostgreSQL", "MongoDB", "Redis", "AWS", "Docker", "Kafka"],
  roleIdeas: ["Backend Engineer", "Senior Node.js Developer", "Platform Engineer"],
  places: ["Remote", "Cairo", "Dubai", "Riyadh", "Berlin"],
  salaryChips: ["$3k – $4.5k", "$4.5k – $6k", "$6k – $8k", "More than $8k"],
  avoidChips: ["Nothing", "No crypto or gambling", "No PHP-only roles", "No night shifts"],
  facts: { notice: "", workAuth: "Egyptian citizen. Needs a visa outside Egypt", linkedin: "linkedin.com/in/ahmed-hassan" },
  gaps: [
    { skill: "Kafka streaming", jobs: 7, course: "Kafka for Node.js developers", provider: "Confluent", hours: 6, quiz: [
      { q: "A consumer crashes after processing a message but before committing its offset. What happens when it restarts?", options: ["The message is lost", "The message is processed again", "Kafka deletes the topic"], answer: 1 },
      { q: "You need all events for one customer to stay in order. What do you use as the message key?", options: ["A random UUID", "The customer ID", "The current timestamp"], answer: 1 },
      { q: "What lets several consumers share the work of one topic?", options: ["A consumer group", "A second broker", "A bigger partition"], answer: 0 },
    ] },
    { skill: "Go", jobs: 4, course: "Go for backend engineers", provider: "Coursera", hours: 14, quiz: [
      { q: "What does a goroutine cost compared with an OS thread?", options: ["About the same", "Much less memory", "Much more memory"], answer: 1 },
      { q: "How do two goroutines safely pass data?", options: ["A channel", "A global variable", "Reflection"], answer: 0 },
      { q: "What does `defer` do?", options: ["Runs a line when the function returns", "Skips a line", "Runs a line in parallel"], answer: 0 },
    ] },
    { skill: "Kubernetes", jobs: 3, course: "Kubernetes fundamentals", provider: "Linux Foundation", hours: 20, quiz: [
      { q: "What keeps a set number of identical pods running?", options: ["A Deployment", "A ConfigMap", "A Secret"], answer: 0 },
      { q: "What gives pods one stable address inside the cluster?", options: ["A Service", "A Volume", "A Namespace"], answer: 0 },
      { q: "Where do you keep a database password?", options: ["In the image", "In a Secret", "In the pod name"], answer: 1 },
    ] },
  ],
  jobs: build(
    "a",
    [
      ["Senior Backend Engineer", "Deel", "#0E1B2C", "Remote, worldwide", "Remote", [5500, 7500], "Workable", "plato", 96, ["You've built payment systems, which is their core product", "Uses Node.js and PostgreSQL every day, like you", "Fully remote, which is what you asked for"], []],
      ["Backend Engineer, Platform", "GitLab", "#E24329", "Remote, EMEA", "Remote", [5000, 6800], "Greenhouse", "plato", 91, ["Your Node.js, Redis and Docker experience matches", "Remote across Europe and the Middle East"], ["They'd like some Go, which isn't on your CV"]],
      ["Senior Backend Engineer (Node.js)", "Careem", "#1DBF73", "Dubai, UAE", "Hybrid", [7000, 9500], "LinkedIn", "chrome", 93, ["Same stack as your work at Swvl: NestJS, PostgreSQL, Redis", "Ride-hailing, like Swvl"], ["Hybrid in Dubai: you'd need to move"]],
      ["Senior Software Engineer", "Tabby", "#3BFFC1", "Dubai, UAE", "Hybrid", [7500, 10000], "Greenhouse", "plato", 90, ["Payments again, your strongest area", "Pays well above what you asked for"], ["Hybrid in Dubai: you'd need to move"]],
      ["Senior Node.js Engineer", "Toptal", "#204ECF", "Remote, worldwide", "Remote", undefined, "Lever", "plato", 88, ["Node.js and NestJS, your main skills", "Remote"], ["Salary not listed"]],
      ["Senior Software Engineer, Payments", "Swvl", "#FF4D4D", "Remote, EMEA", "Remote", [5000, 6500], "LinkedIn", "chrome", 89, ["Your current company's payments team: they know your work"], []],
      ["Senior NestJS Engineer", "Talabat", "#FF5A00", "Dubai, UAE", "On-site", [6500, 8500], "Indeed", "plato", 85, ["NestJS and Redis, both strong on your CV"], ["Office 5 days a week in Dubai"]],
      ["Backend Engineer (Payments)", "Revolut", "#191C1F", "Remote, EMEA", "Remote", [4800, 6500], "Lever", "plato", 86, ["Payments and PostgreSQL match"], ["Some Java in their stack"]],
      ["Staff Backend Engineer", "Vercel", "#111111", "Remote, EMEA", "Remote", [8000, 11000], "Ashby", "plato", 84, ["Node.js and TypeScript at very large scale"], ["Asks for 8+ years; you have 5"]],
      ["Senior Software Engineer, Platform", "N26", "#36A18B", "Berlin, Germany", "Hybrid", [6500, 8000], "Greenhouse", "plato", 87, ["Banking backend with AWS and Docker, like your CV"], ["Hybrid in Berlin: they sponsor visas"]],
      ["Backend Engineer", "Paymob", "#1A4BFF", "Cairo, Egypt", "On-site", [3000, 4200], "Wuzzuf", "manual", 82, ["Payments, in Cairo where you live"], ["Pays less than you asked for"]],
      ["Staff Backend Engineer", "Noon", "#FEEE00", "Dubai, UAE", "Hybrid", [9000, 12000], "Bayt", "manual", 81, ["E-commerce at large scale; your MongoDB and AWS fit"], ["Wants team-lead experience"]],
      ["Backend Engineer", "Instabug", "#1D82DC", "Remote, Egypt", "Remote", [3200, 4200], "Wuzzuf", "manual", 77, ["Your previous company"], ["Pays less than you asked for"]],
      ["Node.js Engineer", "Anghami", "#A020F0", "Remote, MENA", "Remote", [4200, 5600], "Greenhouse", "plato", 85, ["Node.js, Redis and MongoDB match"], []],
    ],
    about,
  ),
  interview: (j) => [
    { q: `Tell me about a system you built that had to handle a lot of traffic. What would you do differently${j ? ` at ${j.company}` : ""}?`, hint: "Give numbers: how many requests, how fast, what broke first.", example: "At Swvl our booking API hit 3,000 requests a second at peak. Postgres ran out of connections, so I added PgBouncer and a Redis cache for seat maps. p95 latency dropped from 900ms to 380ms." },
    { q: "How do you make a payment safe to retry, so a customer is never charged twice?", hint: "Idempotency keys: where you store them and what the client sees.", example: "Every payment request carries an idempotency key from the client. We store the key with the result in Postgres under a unique index, so a retry returns the first result instead of charging again." },
    { q: "Tell me about a time you disagreed with a teammate about a technical decision.", hint: "One real story. What you did, not the team.", example: "A teammate wanted to split booking into five microservices. I argued for two, showed the on-call cost of five, and we agreed to start with two and split later if needed. We never had to." },
  ],
}

export const MONA: Persona = {
  id: "mona",
  name: "Mona Al-Qahtani",
  first: "Mona",
  headline: "Senior Accountant",
  city: "Riyadh, Saudi Arabia",
  email: "mona.q@example.com",
  cv: "Mona_AlQahtani_CV.pdf",
  currency: "SAR",
  years: 6,
  experience: [
    { title: "Senior Accountant", company: "Almarai", years: "2021 – now", did: "Closes the monthly books for 3 business units; cut month-end close from 9 days to 5." },
    { title: "Accountant", company: "PwC Middle East", years: "2018 – 2021", did: "Audited retail and food clients; prepared VAT returns after VAT started in Saudi Arabia." },
  ],
  skills: ["IFRS", "VAT (ZATCA)", "Month-end close", "SAP", "Excel", "Audit", "Financial reporting"],
  roleIdeas: ["Senior Accountant", "Financial Accountant", "Finance Manager"],
  places: ["Riyadh", "Jeddah", "Dammam", "Remote"],
  salaryChips: ["SAR 12k – 15k", "SAR 15k – 20k", "SAR 20k – 25k", "More than SAR 25k"],
  avoidChips: ["Nothing", "No audit firms", "No travel", "No night shifts"],
  facts: { notice: "", workAuth: "Saudi citizen", linkedin: "linkedin.com/in/mona-alqahtani" },
  gaps: [
    { skill: "Power BI", jobs: 6, course: "Power BI for finance teams", provider: "Microsoft Learn", hours: 8, quiz: [
      { q: "You want a chart that updates when new monthly numbers arrive. What do you connect it to?", options: ["A screenshot of Excel", "The data source, then refresh", "A PDF report"], answer: 1 },
      { q: "Which visual is best for revenue over 12 months?", options: ["Line chart", "Pie chart", "Single number card"], answer: 0 },
      { q: "What lets a manager click one region and see only its numbers?", options: ["A slicer", "A bookmark", "A theme"], answer: 0 },
    ] },
    { skill: "IFRS 16 leases", jobs: 4, course: "IFRS 16 in practice", provider: "ACCA", hours: 5, quiz: [
      { q: "Under IFRS 16, where does a 5-year office lease appear?", options: ["Only in expenses", "On the balance sheet as an asset and a liability", "Only in the notes"], answer: 1 },
      { q: "What reduces the lease liability each month?", options: ["The lease payment, less interest", "Depreciation", "Nothing"], answer: 0 },
      { q: "Which lease can you leave off the balance sheet?", options: ["A 12-month or shorter lease", "Any office lease", "Any car lease"], answer: 0 },
    ] },
    { skill: "Oracle Fusion", jobs: 3, course: "Oracle Fusion Financials basics", provider: "Oracle University", hours: 12, quiz: [
      { q: "Where do you record a supplier invoice?", options: ["Payables", "Receivables", "Fixed assets"], answer: 0 },
      { q: "What closes a period so no one posts to it?", options: ["Closing the period in General Ledger", "Deleting the journal", "Exporting to Excel"], answer: 0 },
      { q: "What matches a payment to an invoice?", options: ["Reconciliation", "Depreciation", "Revaluation"], answer: 0 },
    ] },
  ],
  jobs: build(
    "m",
    [
      ["Senior Accountant", "Tamara", "#F7A9C5", "Riyadh", "Hybrid", [17000, 21000], "LinkedIn", "chrome", 94, ["You close the books every month at Almarai, the core of this job", "VAT with ZATCA, which you've done since 2018", "Hybrid in Riyadh, where you live"], []],
      ["Financial Accountant", "Al Rajhi Bank", "#1B3C8C", "Riyadh", "On-site", [16000, 20000], "Bayt", "manual", 90, ["IFRS reporting, which you do now", "Your audit years at PwC count for banks"], ["Office 5 days a week"]],
      ["Senior Accountant, Month-end", "Jahez", "#E0263A", "Riyadh", "Hybrid", [15000, 18000], "Greenhouse", "plato", 92, ["They want someone who sped up month-end close; you cut it from 9 days to 5"], []],
      ["Finance Manager", "Foodics", "#6B3FD1", "Riyadh", "Hybrid", [22000, 28000], "Lever", "plato", 86, ["Food sector, like Almarai", "A step up into managing a small team"], ["Asks for 1 year of managing people; your CV doesn't show it"]],
      ["Senior Accountant", "Almarai", "#1E5AA8", "Riyadh", "On-site", [15000, 19000], "Workable", "plato", 88, ["Your own company, a different business unit"], []],
      ["Senior Financial Accountant", "STC", "#4F008C", "Riyadh", "On-site", [18000, 23000], "LinkedIn", "chrome", 85, ["Large-company IFRS reporting"], ["Wants Oracle Fusion; you know SAP"]],
      ["Accounting Manager", "Lean", "#0F1E3D", "Riyadh", "Hybrid", [20000, 25000], "Ashby", "plato", 83, ["Fintech, with VAT and reporting you know"], ["Asks for Power BI dashboards"]],
      ["Senior Accountant", "Sary", "#00B386", "Riyadh", "Hybrid", [14000, 17000], "Workable", "plato", 84, ["Month-end close and VAT match"], ["At the low end of your range"]],
      ["Financial Reporting Specialist", "Deloitte", "#86BC25", "Riyadh", "Hybrid", [16000, 20000], "Indeed", "plato", 80, ["Your PwC audit experience"], ["Audit firm with travel to clients"]],
      ["Senior Accountant", "Noon", "#FEEE00", "Riyadh", "Hybrid", [16000, 19000], "Bayt", "manual", 82, ["E-commerce VAT, which you know"], []],
      ["Senior Accountant (Remote)", "Tabby", "#3BFFC1", "Remote, Saudi Arabia", "Remote", [15000, 18000], "Greenhouse", "plato", 87, ["Remote within Saudi Arabia", "Fintech VAT and reporting"], []],
      ["Senior Accountant", "Careem", "#1DBF73", "Jeddah", "Hybrid", [16000, 19500], "LinkedIn", "chrome", 79, ["IFRS and VAT match"], ["Jeddah: you'd need to move"]],
    ],
    about,
  ),
  interview: (j) => [
    { q: `Walk me through how you run month-end close${j ? `, and what you'd change first at ${j.company}` : ""}.`, hint: "Name the steps, who owns them, and how many days it takes.", example: "At Almarai I start reconciliations on day minus 2, accruals on day 1, and review on day 3. I moved bank reconciliations into a daily routine, which took close from 9 days to 5." },
    { q: "ZATCA rejects one of your VAT returns. What do you do?", hint: "Find the cause, correct it, and stop it happening again.", example: "I'd pull the rejection reason, trace the invoices behind the wrong line, file a correction within the deadline, and add a check to our invoice template so it can't recur." },
    { q: "Tell me about a time you found a mistake in someone else's numbers.", hint: "One real story. Be kind about the person.", example: "At PwC I found a client double-counting inventory in transit. I showed the controller the two entries privately, we fixed it before the report went out, and I suggested a cut-off checklist they still use." },
  ],
}

export const PERSONAS = { ahmed: AHMED, mona: MONA }
