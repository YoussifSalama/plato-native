// Content for the Career hub's practice modules: skill assessments, general interviews and
// proof-of-skill challenges. Fixed banks for now (no server endpoint yet); the hub scores them
// in the browser and keeps results on this device (lib/career-hub/store.ts).

export type Level = 1 | 2 | 3
// The first option is always the right one; the session shuffles them for display.
export type Question = { id: string; level: Level; topic: string; q: string; options: string[]; why: string }
export type Bank = { skill: string; blurb: string; aliases: RegExp; questions: Question[] }

const q = (id: string, level: Level, topic: string, text: string, options: string[], why: string): Question => ({ id, level, topic, q: text, options, why })

export const BANKS: Bank[] = [
  {
    skill: "SQL",
    blurb: "Filtering, joins, aggregation and window functions",
    aliases: /\b(sql|postgres|postgresql|mysql|sqlite|t-?sql|bigquery|snowflake|database)/i,
    questions: [
      q("sql1", 1, "Filtering", "Which clause filters rows before they are grouped?", ["WHERE", "HAVING", "ORDER BY", "LIMIT"], "WHERE runs on rows; HAVING runs on groups after GROUP BY."),
      q("sql2", 1, "Basics", "Which returns each country in `customers` once?", ["SELECT DISTINCT country FROM customers", "SELECT UNIQUE(country) FROM customers", "SELECT country FROM customers ONCE", "SELECT ONLY country FROM customers"], "DISTINCT removes duplicate rows from the result."),
      q("sql3", 1, "Aggregation", "What does COUNT(*) return?", ["The number of rows, NULLs included", "The non-null values in the first column", "The sum of all values", "The number of distinct rows"], "COUNT(*) counts rows; COUNT(col) skips NULLs in that column."),
      q("sql4", 2, "Joins", "You need customers who have never ordered. Best approach?", ["LEFT JOIN orders and keep rows where orders.id IS NULL", "INNER JOIN orders", "CROSS JOIN orders", "UNION customers and orders"], "A LEFT JOIN keeps every customer; a NULL on the order side means no match."),
      q("sql5", 2, "Aggregation", "Customers with more than 5 orders: which condition?", ["HAVING COUNT(*) > 5", "WHERE COUNT(*) > 5", "GROUP BY COUNT(*) > 5", "FILTER COUNT(*) > 5"], "Aggregates can only be filtered after grouping, with HAVING."),
      q("sql6", 2, "Basics", "What does `NULL = NULL` evaluate to?", ["Unknown, so the row is not returned", "True", "False, and the row is returned", "An error"], "Comparisons with NULL are unknown; use IS NULL."),
      q("sql7", 3, "Window functions", "Number each customer's orders newest first, restarting per customer:", ["ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC)", "RANK() OVER (ORDER BY customer_id)", "GROUP BY customer_id ORDER BY created_at DESC", "DENSE_RANK() OVER (PARTITION BY created_at)"], "PARTITION BY restarts the numbering; ORDER BY sets the order inside each partition."),
      q("sql8", 3, "Performance", "`WHERE LOWER(email) = ?` is slow even though `email` is indexed. Why?", ["The function on the column stops the plain index from being used", "Indexes never work on text", "LOWER is not deterministic", "The table needs a VACUUM"], "Index the expression (or store a normalised column) instead."),
      q("sql9", 3, "Window functions", "A running total of revenue by day:", ["SUM(revenue) OVER (ORDER BY day)", "SUM(revenue) ... GROUP BY day", "CUMSUM(revenue)", "SUM(revenue) OVER (PARTITION BY day)"], "An ordered window sums every row up to the current one."),
    ],
  },
  {
    skill: "Excel",
    blurb: "Formulas, lookups, PivotTables and dynamic arrays",
    aliases: /\b(excel|spreadsheet|google sheets|vba|pivot)/i,
    questions: [
      q("xl1", 1, "Formulas", "Which function adds up a range?", ["SUM", "COUNT", "ADD", "TOTAL"], "SUM adds; COUNT counts numeric cells."),
      q("xl2", 1, "References", "A reference to A1 that never changes when the formula is copied:", ["$A$1", "A1", "A$1", "#A1"], "The $ locks the column and the row."),
      q("xl3", 1, "Charts", "Best chart for a trend over 12 months:", ["Line chart", "Pie chart", "Donut chart", "Treemap"], "Lines show change over time; pies show shares of one total."),
      q("xl4", 2, "Lookups", "Find a product's price by ID in another table (modern Excel):", ["XLOOKUP(id, ids, prices)", "SUMIF(prices, id)", "INDEX(prices)", "MATCH(prices, id)"], "XLOOKUP searches one range and returns from another."),
      q("xl5", 2, "Formulas", "Count orders above 500 in column B:", ["COUNTIF(B:B, \">500\")", "COUNT(B:B>500)", "SUMIF(B:B, \">500\")", "COUNTA(B:B)"], "COUNTIF counts cells that meet a condition."),
      q("xl6", 2, "Analysis", "Fastest way to summarise sales by region and month:", ["A PivotTable", "Conditional formatting", "Data validation", "Freeze panes"], "PivotTables group and total in a few clicks."),
      q("xl7", 3, "Lookups", "VLOOKUP returns wrong values after a column is inserted in the lookup table. Most robust fix?", ["Use XLOOKUP or INDEX/MATCH, which don't depend on a column number", "Sort the table", "Switch to approximate match", "Paste the table as values"], "VLOOKUP's column index is hard-coded and shifts when columns move."),
      q("xl8", 3, "Dynamic arrays", "Return every row whose status is Open, updating automatically:", ["FILTER(A2:D100, C2:C100=\"Open\")", "VLOOKUP(\"Open\", A2:D100, 3)", "SORT(C2:C100)", "UNIQUE(C2:C100=\"Open\")"], "FILTER spills all matching rows."),
      q("xl9", 3, "Formulas", "=SUMPRODUCT((A2:A10=\"North\")*(B2:B10)) returns…", ["The total of B where A is North", "The number of North rows", "An error", "The average of B for North"], "The TRUE/FALSE mask multiplies each B value by 1 or 0."),
    ],
  },
  {
    skill: "Python",
    blurb: "Core language, data structures and pandas",
    aliases: /\b(python|pandas|numpy|django|flask|fastapi|jupyter)/i,
    questions: [
      q("py1", 1, "Basics", "What is `len([1, 2, 3])`?", ["3", "2", "6", "An error"], "len counts the items."),
      q("py2", 1, "Data structures", "Which of these is mutable?", ["list", "tuple", "str", "frozenset"], "Lists can be changed in place; the others can't."),
      q("py3", 1, "Basics", "What does `print(7 // 2)` show?", ["3", "3.5", "4", "1"], "// is floor division."),
      q("py4", 2, "Data structures", "With `d = {}`, what does `d.get('a', 0)` return?", ["0", "KeyError", "None", "'a'"], "get returns the default when the key is missing."),
      q("py5", 2, "Idioms", "Squares of the even numbers in `nums`:", ["[n * n for n in nums if n % 2 == 0]", "[n * n if n % 2 for n in nums]", "[for n in nums: n * n]", "nums.square(even=True)"], "The filter goes after the for clause."),
      q("py6", 2, "Idioms", "What does `with open(path) as f:` guarantee?", ["The file is closed even if an error occurs", "The whole file is read into memory", "The file is locked", "The file exists"], "The context manager always runs its cleanup."),
      q("py7", 3, "Gotchas", "`def f(x, items=[]): items.append(x); return items` — what does `f(2)` return after `f(1)`?", ["[1, 2]", "[2]", "[1]", "An error"], "Default values are created once, so the list is shared between calls."),
      q("py8", 3, "pandas", "Average salary per department in a DataFrame `df`:", ["df.groupby('department')['salary'].mean()", "df.mean('department')", "df['salary'].groupby().mean()", "df.pivot('salary')"], "groupby, pick the column, then aggregate."),
      q("py9", 3, "Performance", "Best structure for fast membership checks on a million IDs:", ["set", "list", "tuple", "str"], "Set lookups are O(1) on average; list lookups are O(n)."),
    ],
  },
  {
    skill: "JavaScript",
    blurb: "Language core, async code and React state",
    aliases: /\b(javascript|typescript|js|ts|react|node|next\.?js|vue|angular|frontend)/i,
    questions: [
      q("js1", 1, "Basics", "What is `typeof []`?", ["'object'", "'array'", "'list'", "'undefined'"], "Arrays are objects; use Array.isArray to check."),
      q("js2", 1, "Basics", "Declare a variable that can't be reassigned:", ["const", "let", "var", "static"], "const blocks reassignment (the object itself can still change)."),
      q("js3", 1, "Arrays", "What is `[1, 2, 3].map(x => x * 2)`?", ["[2, 4, 6]", "12", "[1, 2, 3, 1, 2, 3]", "undefined"], "map returns a new array of the results."),
      q("js4", 2, "Numbers", "Why is `0.1 + 0.2 === 0.3` false?", ["Floating-point numbers can't store 0.1 exactly", "=== is broken for numbers", "It throws", "It's true in strict mode"], "Compare with a small tolerance instead."),
      q("js5", 2, "Async", "What does `await` do?", ["Pauses this async function until the promise settles", "Blocks the whole thread", "Converts a value to a string", "Runs code on another thread"], "Other work keeps running while the function waits."),
      q("js6", 2, "Basics", "How does `===` differ from `==`?", ["=== compares without converting types", "They are identical", "== is stricter", "=== only works on numbers"], "== coerces types first, which surprises people."),
      q("js7", 3, "Closures", "`for (var i = 0; i < 3; i++) setTimeout(() => console.log(i))` prints…", ["3 3 3", "0 1 2", "0 0 0", "undefined three times"], "var is function-scoped, so every callback sees the final i. let would print 0 1 2."),
      q("js8", 3, "React", "Why write `setCount(c => c + 1)`?", ["It uses the latest state when updates are batched", "It makes the update synchronous", "It skips the re-render", "Numbers require it"], "The updater function receives the current state, not a stale copy."),
      q("js9", 3, "Async", "When does `Promise.all` reject?", ["As soon as any one promise rejects", "Only when all of them reject", "When the last one rejects", "Never; it waits for all"], "Use Promise.allSettled to wait for every result."),
    ],
  },
  {
    skill: "Data analysis",
    blurb: "Statistics, metrics, experiments and charts",
    aliases: /\b(data analy|analytics|power ?bi|tableau|looker|statistic|bi\b|business intelligence|reporting|kpi)/i,
    questions: [
      q("da1", 1, "Statistics", "What is the median of 2, 3 and 100?", ["3", "35", "2", "100"], "The median is the middle value, so outliers don't pull it."),
      q("da2", 1, "Charts", "Best chart to compare sales across 6 product categories:", ["Bar chart", "Line chart", "Scatter plot", "Area chart"], "Bars compare categories; lines show change over time."),
      q("da3", 1, "Statistics", "Which of these measures spread?", ["Standard deviation", "Mean", "Mode", "Median"], "Standard deviation says how far values sit from the mean."),
      q("da4", 2, "Metrics", "Conversion went from 4% to 5%. That is…", ["+1 percentage point, a 25% relative increase", "A 1% increase", "A 5% increase", "A 20% increase"], "Say which one you mean; the two are often mixed up."),
      q("da5", 2, "Reasoning", "Two metrics are strongly correlated. You can say…", ["They move together; causation needs more evidence", "One causes the other", "They are independent", "The data is wrong"], "Look for an experiment or a mechanism before claiming cause."),
      q("da6", 2, "Statistics", "A few huge orders skew average order value. Better summary?", ["The median", "The mean", "The maximum", "The sum"], "The median resists outliers."),
      q("da7", 3, "Experiments", "An A/B test shows +3% with p = 0.20. Best call?", ["Not enough evidence yet: keep testing or decide knowing the risk", "Ship it, 3% is good", "The variant is worse", "There is an 80% chance it works"], "p = 0.20 means a result this size is common by chance alone."),
      q("da8", 3, "Charts", "Retention by signup-month cohort is best shown as…", ["A cohort table or heatmap", "A pie chart", "One KPI number", "A histogram of ages"], "Rows are cohorts, columns are months since signup."),
      q("da9", 3, "Reasoning", "Average order value rose in every region but fell overall. Likely cause?", ["More orders came from lower-value regions (a mix shift)", "Always a calculation bug", "Currency rounding", "Seasonality"], "This is Simpson's paradox: the weights changed, not the regions."),
    ],
  },
  {
    skill: "Project management",
    blurb: "Planning, Agile delivery, risk and stakeholders",
    aliases: /\b(project manag|program manag|pmp|agile|scrum|kanban|jira|delivery|prince2)/i,
    questions: [
      q("pm1", 1, "Planning", "What is a project's critical path?", ["The longest chain of dependent tasks; it sets the finish date", "The most expensive tasks", "The tasks the manager owns", "The first tasks in the plan"], "Any delay on it delays the whole project."),
      q("pm2", 1, "Agile", "In Scrum, who owns the product backlog?", ["The Product Owner", "The Scrum Master", "The developers", "The stakeholders"], "The Product Owner orders the backlog."),
      q("pm3", 1, "Roles", "A RACI chart shows…", ["Who is Responsible, Accountable, Consulted and Informed", "Risks and issues", "Budget by phase", "The release calendar"], "It makes ownership explicit for each deliverable."),
      q("pm4", 2, "Agile", "A stakeholder asks for a new feature mid-sprint. Best response?", ["Add it to the backlog and prioritise it with the Product Owner", "Add it to this sprint right away", "Refuse it", "Ask the team to work overtime"], "Protect the sprint goal; reprioritise openly."),
      q("pm5", 2, "Planning", "A critical-path task slips 3 days. If nothing changes, the end date…", ["Slips 3 days", "Doesn't move", "Slips 1.5 days", "Depends on the budget"], "Critical-path tasks have no slack."),
      q("pm6", 2, "Risk", "Best first step when you spot a new risk:", ["Log it with likelihood, impact, an owner and a response", "Escalate to the CEO", "Wait until it happens", "Add buffer to every task"], "A risk without an owner is a risk nobody manages."),
      q("pm7", 3, "Control", "50% of the time used, 30% of the work done, 60% of the budget spent. Status?", ["Behind schedule and over budget: re-plan now", "On track", "Ahead of schedule", "Over budget but on schedule"], "Earned value (30%) is below both planned value (50%) and cost (60%)."),
      q("pm8", 3, "Stakeholders", "Two teams are blocked waiting on each other. Best move?", ["Get both leads together, agree the interface and sequence, and track it as a shared dependency", "Let them sort it out", "Escalate both teams", "Cancel one workstream"], "Make the dependency visible and owned."),
      q("pm9", 3, "Agile", "When is Kanban a better fit than Scrum?", ["A continuous flow of unpredictable work, like support", "Fixed scope with a hard deadline", "When there is no backlog", "Never"], "Kanban limits work in progress without fixed sprints."),
    ],
  },
  {
    skill: "Business communication",
    blurb: "Emails, updates, presenting and hard conversations",
    aliases: /\b(communicat|presentation|stakeholder|writing|negotiat|customer|client|presales|consult|sales|account)/i,
    questions: [
      q("bc1", 1, "Writing", "The most useful email subject line:", ["Decision needed by Thu: Q3 vendor shortlist", "Quick question", "Hi", "Following up"], "Say what you need and by when."),
      q("bc2", 1, "Updates", "A status update should open with…", ["The bottom line: where things stand and what you need", "The background history", "An apology", "Every task you did"], "Busy readers stop after the first lines."),
      q("bc3", 1, "Listening", "Active listening means…", ["Playing back what you heard and asking clarifying questions", "Waiting for your turn", "Only taking notes", "Agreeing with everything"], "It shows you understood before you answer."),
      q("bc4", 2, "Clients", "A client is upset about a missed deadline. Your first reply should…", ["Acknowledge the impact, own it, give the new date and what changes", "Explain whose fault it was", "Wait until you have every answer", "Offer a discount and nothing else"], "Ownership and a concrete plan rebuild trust."),
      q("bc5", 2, "Presenting", "Presenting to executives, you should…", ["Lead with the recommendation, then the evidence", "Start with your method", "Show every chart", "Save the conclusion for the end"], "Answer first; detail on request."),
      q("bc6", 2, "Negotiation", "Pushing back on an unrealistic deadline:", ["Lay out the trade-offs: what ships by then and what needs more time", "Accept and hope", "Refuse outright", "Complain to your peers"], "Options make it a joint decision."),
      q("bc7", 3, "Facilitation", "Two senior stakeholders disagree in a meeting you run. Best move?", ["Name the disagreement, restate both positions, agree the decision criteria and owner", "Side with the more senior one", "Move on to the next item", "Call a vote right away"], "Separate the people from the decision."),
      q("bc8", 3, "Leadership", "You must tell your team their project is cancelled. Best approach?", ["Say it plainly and early, explain why, and what happens next for them", "Send a short email on Friday evening", "Wait for the rumours to settle", "Talk only about the positives"], "Clarity and next steps reduce anxiety."),
      q("bc9", 3, "Writing", "Writing for a global audience, you should…", ["Use short sentences, avoid idioms, spell out acronyms", "Use idioms to sound friendly", "Write more to be thorough", "Use jargon to be precise"], "Plain language travels."),
    ],
  },
]

export const bankFor = (skill: string) => BANKS.find((b) => b.skill.toLowerCase() === skill.toLowerCase()) ?? BANKS.find((b) => b.aliases.test(skill)) ?? null
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
export const bankBySlug = (s: string) => BANKS.find((b) => slug(b.skill) === s) ?? null

// Assessment ability: harder questions answered right count for more.
export const LEVEL_WEIGHT: Record<Level, number> = { 1: 0.55, 2: 0.8, 3: 1 }
export const ASSESSMENT_LENGTH = 7
export const levelLabel = (score: number) => (score >= 85 ? "Advanced" : score >= 65 ? "Proficient" : score >= 40 ? "Developing" : "Beginner")

// ---------- General AI interview ----------

export type Focus = "mixed" | "behavioral" | "technical" | "situational"
export type InterviewQ = { kind: Exclude<Focus, "mixed"> | "motivation"; text: string; good: string }

const BEHAVIORAL: InterviewQ[] = [
  { kind: "behavioral", text: "Tell me about a time you delivered something under a tight deadline. What did you do, and what was the result?", good: "Situation, your own actions, and a measurable result." },
  { kind: "behavioral", text: "Describe a disagreement with a colleague or manager. How did you handle it?", good: "Stay factual, show you listened, and say how it ended." },
  { kind: "behavioral", text: "Tell me about a mistake you made at work and what you changed afterwards.", good: "Own it, the fix, and the lasting change you made." },
  { kind: "behavioral", text: "Give an example of when you influenced a decision without having authority.", good: "How you built the case, who you brought along, the outcome." },
  { kind: "behavioral", text: "Tell me about the project you are proudest of. What was your part?", good: "Your specific contribution and the impact, with a number." },
]
const SITUATIONAL: InterviewQ[] = [
  { kind: "situational", text: "On your first week, you find the project you inherited is a month behind. What do you do in the first five days?", good: "Diagnose, talk to people, re-plan, and communicate early." },
  { kind: "situational", text: "A key customer asks for something your team can't deliver this quarter. How do you respond?", good: "Acknowledge the need, offer options and trade-offs, agree next steps." },
  { kind: "situational", text: "You have three urgent requests from three managers and time for one. How do you decide?", good: "Clear criteria, ask about impact and deadlines, be transparent." },
]
const technical = (role: string, skill: string): InterviewQ[] => [
  { kind: "technical", text: `Walk me through how you have used ${skill} in real work. What problem did it solve?`, good: "A concrete project, your approach, the tools, and the result." },
  { kind: "technical", text: `What's the hardest ${role ? `${role} ` : ""}problem you've solved recently? Take me through your reasoning.`, good: "Constraints, options you weighed, why you chose one, what you'd change." },
  { kind: "technical", text: `How do you check that your work as a ${role || "professional"} is correct before others rely on it?`, good: "Specific checks, reviews or tests, and an example of a catch." },
]
const MOTIVATION: InterviewQ[] = [
  { kind: "motivation", text: "Why are you looking for a new role now, and what are you looking for in the next one?", good: "Positive, forward-looking, and tied to the role." },
  { kind: "motivation", text: "Where do you want to be in three years, and how does this role help?", good: "Realistic growth that connects to the job." },
]

export function interviewQuestions(focus: Focus, role: string, skill: string, count = 5): InterviewQ[] {
  const tech = technical(role, skill || "your main skill")
  if (focus === "behavioral") return BEHAVIORAL.slice(0, count)
  if (focus === "technical") return [...tech, BEHAVIORAL[4], MOTIVATION[0]].slice(0, count)
  if (focus === "situational") return [...SITUATIONAL, BEHAVIORAL[1], MOTIVATION[1]].slice(0, count)
  return [MOTIVATION[0], BEHAVIORAL[0], tech[0], SITUATIONAL[0], BEHAVIORAL[1]].slice(0, count)
}

// Questions for a job description the seeker pasted (job simulation without a matched job).
export function jobQuestions(title: string, company: string, keywords: string[]): InterviewQ[] {
  const [k1 = "the core tools", k2 = "the main responsibilities", k3 = "stakeholders"] = keywords
  return [
    { kind: "motivation", text: `Why ${company || "this company"}, and why the ${title || "role"} now?`, good: "Show you read the posting and connect it to your path." },
    { kind: "technical", text: `The posting puts weight on ${k1}. Tell me about a time you used it and what came of it.`, good: "One concrete project with a result." },
    { kind: "technical", text: `How would you approach ${k2} in your first 90 days here?`, good: "Learn, quick wins, then a plan with measures." },
    { kind: "situational", text: `Working with ${k3}, priorities clash and a deadline is at risk. What do you do?`, good: "Options, trade-offs, and clear communication." },
    { kind: "behavioral", text: "Tell me about a result you are proud of that's relevant to this job.", good: "Situation, your actions, a measurable result." },
  ]
}

// ---------- Proof of skills ----------

export type RubricItem = { label: string; hint: string; any: RegExp }
export type Challenge = { id: string; skill: string; title: string; summary: string; minutes: number; level: "Junior" | "Mid" | "Senior"; brief: string; data?: string; deliverable: string; code?: boolean; targetWords: number; rubric: RubricItem[] }

export const CHALLENGES: Challenge[] = [
  {
    id: "sql-churn",
    skill: "SQL",
    title: "Find customers at risk of churning",
    summary: "Write the query a retention team would actually run",
    minutes: 25,
    level: "Mid",
    brief: "The retention team wants every customer who ordered at least twice but hasn't ordered in the last 90 days, with their last order date and lifetime spend, biggest spenders first.",
    data: "customers(id, name, email, created_at)\norders(id, customer_id, total, created_at)",
    deliverable: "Your SQL query, then two or three sentences on your assumptions.",
    code: true,
    targetWords: 60,
    rubric: [
      { label: "Joins customers to their orders", hint: "JOIN orders on customer_id", any: /\bjoin\b[\s\S]*customer_id|customer_id[\s\S]*\bjoin\b/i },
      { label: "Groups per customer", hint: "GROUP BY the customer", any: /group\s+by/i },
      { label: "Uses the last order date", hint: "MAX(created_at)", any: /max\s*\(\s*\w*\.?created_at/i },
      { label: "Keeps repeat customers only", hint: "HAVING COUNT(...) >= 2", any: /having[\s\S]*count\s*\(/i },
      { label: "Filters on 90 days of inactivity", hint: "An interval or date arithmetic", any: /90|interval|dateadd|date_sub|now\(\)|current_date/i },
      { label: "Sorts by lifetime spend", hint: "ORDER BY SUM(total) DESC", any: /order\s+by[\s\S]*(sum|spend|total)[\s\S]*desc/i },
      { label: "States assumptions", hint: "Time zone, refunds, cancelled orders…", any: /assum|refund|cancel|time ?zone|note/i },
    ],
  },
  {
    id: "data-decisions",
    skill: "Data analysis",
    title: "Turn a dashboard into three decisions",
    summary: "Read the numbers, find what matters, recommend",
    minutes: 20,
    level: "Mid",
    brief: "Monthly numbers for an online store are below. Write three insights a manager can act on, each backed by a number, and end with the one thing you'd do first.",
    data: "Month   Visitors  Orders  Conv.  AOV    Returns\nJul     82,000    2,050   2.5%   $64    4%\nAug     91,000    2,184   2.4%   $61    5%\nSep     104,000   2,288   2.2%   $58    7%\nOct     118,000   2,360   2.0%   $57    9%",
    deliverable: "Three insights with numbers, then one recommendation.",
    targetWords: 140,
    rubric: [
      { label: "Spots falling conversion", hint: "2.5% → 2.0% while traffic grows", any: /conver[\s\S]{0,60}(fall|drop|declin|down|lower|2\.0|2\.5)|(fall|drop|declin|down)[\s\S]{0,60}conver/i },
      { label: "Spots rising returns", hint: "4% → 9%", any: /return[\s\S]{0,60}(ris|grow|up|doubl|9%|increase)|(ris|grow|up|doubl|increase)[\s\S]{0,40}return/i },
      { label: "Notes falling order value", hint: "AOV $64 → $57", any: /aov|order value|basket|\$57|\$64/i },
      { label: "Backs insights with numbers", hint: "Quote figures or percentages", any: /\d+(\.\d+)?\s?%[\s\S]*\d+(\.\d+)?\s?%/ },
      { label: "Makes a clear recommendation", hint: "\"First, I would…\"", any: /recommend|i would|first,|next step|priorit|should/i },
      { label: "Questions the cause", hint: "Traffic quality, a new channel, product issues", any: /because|cause|why|traffic (quality|source|mix)|channel|campaign|segment/i },
    ],
  },
  {
    id: "pm-kickoff",
    skill: "Project management",
    title: "One-page kickoff plan",
    summary: "Plan a 6-week CRM rollout for a 40-person sales team",
    minutes: 30,
    level: "Mid",
    brief: "Sales is moving from spreadsheets to a CRM in 6 weeks. The vendor is chosen. Write the one-page plan you'd bring to the kickoff meeting.",
    deliverable: "Goal, scope, milestones, owners, top risks, and how you'll measure success.",
    targetWords: 180,
    rubric: [
      { label: "Clear goal", hint: "What success looks like in one line", any: /goal|objective|purpose/i },
      { label: "Scope and out of scope", hint: "What's in, what isn't", any: /scope|out of scope|not included|non-goal/i },
      { label: "Milestones with weeks", hint: "Week 1…Week 6", any: /week\s*\d|milestone|phase/i },
      { label: "Named owners", hint: "Who does what (RACI is fine)", any: /owner|responsible|raci|accountable|lead:/i },
      { label: "Risks with responses", hint: "Adoption, data migration…", any: /risk[\s\S]{0,120}(mitigat|plan|response|if )/i },
      { label: "Success measures", hint: "Adoption %, data quality…", any: /measure|metric|kpi|%|adoption rate|success/i },
      { label: "Training and adoption", hint: "People, not only the system", any: /train|adopt|onboard|champion/i },
    ],
  },
  {
    id: "js-debounce",
    skill: "JavaScript",
    title: "Write a debounce function",
    summary: "A classic interview task, done properly",
    minutes: 15,
    level: "Mid",
    brief: "Write `debounce(fn, wait)`: it returns a function that only calls `fn` once calls have stopped for `wait` milliseconds, with the last arguments. Then say where you'd use it.",
    deliverable: "Your code, then one or two sentences on a real use.",
    code: true,
    targetWords: 30,
    rubric: [
      { label: "Returns a new function", hint: "return function / arrow", any: /return\s+(function|\(|\.\.\.|\w+\s*=>)/ },
      { label: "Waits with setTimeout", hint: "setTimeout(…, wait)", any: /setTimeout\s*\(/ },
      { label: "Resets the timer on each call", hint: "clearTimeout(timer)", any: /clearTimeout\s*\(/ },
      { label: "Passes the latest arguments", hint: "...args or apply", any: /\.\.\.\w+|\.apply\s*\(|arguments/ },
      { label: "Keeps `this`", hint: "fn.apply(this, args)", any: /apply\s*\(\s*this|call\s*\(\s*this|\bthis\b/ },
      { label: "Names a real use", hint: "Search box, resize, autosave", any: /search|input|resize|scroll|autosave|typing|keystroke/i },
    ],
  },
  {
    id: "client-escalation",
    skill: "Business communication",
    title: "Reply to an escalated client",
    summary: "Turn an angry email into a plan they trust",
    minutes: 15,
    level: "Junior",
    brief: "A client writes: “This is the second time the monthly report is late. My board meets Thursday and I have nothing. I'm starting to question this contract.” The report will be ready Wednesday noon.",
    deliverable: "Your reply email, ready to send.",
    targetWords: 110,
    rubric: [
      { label: "Acknowledges the impact", hint: "The board meeting, their position", any: /board|understand|i know|i realise|i realize|frustrat|impact/i },
      { label: "Takes ownership", hint: "No excuses or blame", any: /\b(our|my) (fault|mistake|responsibilit)|we (missed|let you down|should have)|i('| a)m sorry|apolog/i },
      { label: "Gives the date", hint: "Wednesday noon", any: /wednesday|wed\b|noon|12(:00)?\s?(pm)?/i },
      { label: "Says what changes", hint: "So it doesn't happen a third time", any: /going forward|from now|next month|process|chang|prevent|won't happen|will not happen/i },
      { label: "Offers extra help", hint: "A call, a preview, prep for the board", any: /call|preview|draft|prepare|walk you through|happy to|meet/i },
      { label: "Ready to send", hint: "Greeting and sign-off", any: /^(hi|dear|hello)[\s\S]*(regards|best|thanks|thank you|sincerely)/i },
    ],
  },
  {
    id: "product-prd",
    skill: "Product management",
    title: "One-page PRD: saved searches",
    summary: "Spec a feature the way engineers like it",
    minutes: 30,
    level: "Mid",
    brief: "Users of a job board keep re-typing the same search. Write a one-page PRD for “saved searches with email alerts”.",
    deliverable: "Problem, users, goals and metrics, scope and non-goals, open questions.",
    targetWords: 180,
    rubric: [
      { label: "States the problem", hint: "Who hurts, and how much", any: /problem|pain|today users|currently/i },
      { label: "Names the users", hint: "Personas or segments", any: /user|persona|segment|job seeker|candidate/i },
      { label: "Measurable goals", hint: "A metric and a target", any: /metric|kpi|goal|target|%|retention|return visits/i },
      { label: "Scope and non-goals", hint: "What's out for v1", any: /non-goal|out of scope|not in v1|scope/i },
      { label: "Alert details", hint: "Frequency, unsubscribe, limits", any: /daily|weekly|frequency|unsubscribe|digest|limit/i },
      { label: "Open questions or risks", hint: "What you still need to learn", any: /open question|risk|unknown|assumption|tbd/i },
    ],
  },
]

// A fixed challenge by id, or the generic one for "skill-<slug>" (the name comes from ?skill when known).
export function challengeById(id: string, skillName?: string | null): Challenge {
  const fixed = CHALLENGES.find((c) => c.id === id)
  if (fixed) return fixed
  const fromSlug = id.replace(/^skill-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return challengeFor(skillName && slug(skillName) === id.replace(/^skill-/, "") ? skillName : fromSlug)
}

// A challenge for a skill without a fixed one (usually a skill gap from the seeker's matches).
export function challengeFor(skill: string): Challenge {
  const fixed = CHALLENGES.find((c) => c.skill.toLowerCase() === skill.toLowerCase())
  if (fixed) return fixed
  return {
    id: `skill-${slug(skill)}`,
    skill,
    title: `Show how you'd use ${skill}`,
    summary: "A short case study an employer can read in two minutes",
    minutes: 20,
    level: "Mid",
    brief: `Several of your job matches ask for ${skill}. Pick a realistic problem from your field and show how you would solve it with ${skill}: the situation, your steps, the result you'd expect, and what could go wrong.`,
    deliverable: "A short case study: situation, approach in steps, expected result, risks.",
    targetWords: 150,
    rubric: [
      { label: "Realistic situation", hint: "A team, a goal, a constraint", any: /team|client|company|project|situation|context/i },
      { label: `Uses ${skill} specifically`, hint: `Name how ${skill} is applied`, any: new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      { label: "Clear steps", hint: "First, then, finally", any: /first|then|step|next|finally|1\.|2\./i },
      { label: "Measurable result", hint: "A number or a target", any: /\d+\s?%|\d+ (days|weeks|hours)|reduc|increas|sav/i },
      { label: "Risks or trade-offs", hint: "What could go wrong", any: /risk|trade-?off|downside|limitation|could go wrong|however/i },
    ],
  }
}
