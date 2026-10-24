import { mentions } from '../resume/resume-checks';

// Skills we look for in postings. Curated and cheap on purpose: a posting
// mentions a skill when the word is there, no model call per job. A skill
// missing from this list is simply not counted. First name is the display
// name; the rest are other spellings.
const VOCAB: string[][] = [
  ['JavaScript'],
  ['TypeScript'],
  ['Python'],
  ['Java'],
  ['C#'],
  ['C++'],
  ['PHP'],
  ['Ruby'],
  ['Golang'],
  ['Rust'],
  ['Kotlin'],
  ['Swift'],
  ['Dart'],
  ['Scala'],
  ['React', 'react.js', 'reactjs'],
  ['Next.js', 'nextjs'],
  ['Vue', 'vue.js'],
  ['Angular'],
  ['Svelte'],
  ['HTML'],
  ['CSS'],
  ['Tailwind', 'tailwindcss'],
  ['Node.js', 'nodejs'],
  ['Express'],
  ['NestJS'],
  ['Django'],
  ['Flask'],
  ['FastAPI'],
  ['Spring', 'spring boot'],
  ['Laravel'],
  ['.NET', 'asp.net'],
  ['Rails', 'ruby on rails'],
  ['GraphQL'],
  ['REST'],
  ['gRPC'],
  ['SQL'],
  ['PostgreSQL', 'postgres'],
  ['MySQL'],
  ['MongoDB'],
  ['Redis'],
  ['Elasticsearch'],
  ['Kafka'],
  ['RabbitMQ'],
  ['Snowflake'],
  ['BigQuery'],
  ['Spark'],
  ['Airflow'],
  ['dbt'],
  ['Hadoop'],
  ['AWS', 'amazon web services'],
  ['Azure'],
  ['GCP', 'google cloud'],
  ['Docker'],
  ['Kubernetes', 'k8s'],
  ['Terraform'],
  ['Ansible'],
  ['Jenkins'],
  ['CI/CD'],
  ['GitHub Actions'],
  ['Linux'],
  ['Git'],
  ['React Native'],
  ['Flutter'],
  ['Android'],
  ['iOS'],
  ['Machine Learning'],
  ['Deep Learning'],
  ['TensorFlow'],
  ['PyTorch'],
  ['scikit-learn'],
  ['Pandas'],
  ['NumPy'],
  ['NLP'],
  ['LLM', 'llms'],
  ['Power BI', 'powerbi'],
  ['Tableau'],
  ['Looker'],
  ['Excel'],
  ['Google Analytics'],
  ['Data Analysis'],
  ['Data Visualization'],
  ['A/B Testing'],
  ['ETL'],
  ['Figma'],
  ['Sketch'],
  ['Adobe XD'],
  ['Photoshop'],
  ['Illustrator'],
  ['UI/UX', 'ux design', 'ui design'],
  ['User Research'],
  ['Wireframing'],
  ['Selenium'],
  ['Cypress'],
  ['Playwright'],
  ['Jest'],
  ['Postman'],
  ['Jira'],
  ['Agile'],
  ['Scrum'],
  ['Kanban'],
  ['SEO'],
  ['SEM'],
  ['Google Ads'],
  ['Meta Ads', 'facebook ads'],
  ['Content Marketing'],
  ['Email Marketing'],
  ['Social Media'],
  ['HubSpot'],
  ['Salesforce'],
  ['CRM'],
  ['Copywriting'],
  ['SAP'],
  ['QuickBooks'],
  ['Financial Modeling'],
  ['Accounting'],
  ['IFRS'],
  ['Budgeting'],
  ['Forecasting'],
  ['Payroll'],
  ['Project Management'],
  ['Product Management'],
  ['PMP'],
  ['Stakeholder Management'],
  ['Cybersecurity'],
  ['Penetration Testing'],
  ['SIEM'],
  ['ISO 27001'],
  ['Networking'],
  ['Cisco'],
  ['VMware'],
  ['ITIL'],
  ['Recruitment'],
  ['Customer Success'],
  ['Negotiation'],
];

// Vocabulary skills a posting mentions.
export function skillsIn(text: string): string[] {
  return VOCAB.filter((names) => names.some((n) => mentions(text, n))).map(
    (n) => n[0],
  );
}

// `missing[i]` = the skills job i asks for that the seeker lacks.
// missingIn: jobs asking for it. unlocks: jobs where it is the ONLY gap, so
// learning it alone makes the seeker a full skills fit.
export function aggregate(missing: string[][], top = 20) {
  const by = new Map<
    string,
    { skill: string; missingIn: number; unlocks: number }
  >();
  for (const job of missing)
    for (const skill of job) {
      const row = by.get(skill) ?? { skill, missingIn: 0, unlocks: 0 };
      row.missingIn++;
      if (job.length === 1) row.unlocks++;
      by.set(skill, row);
    }
  return [...by.values()]
    .sort((a, b) => b.missingIn - a.missingIn || b.unlocks - a.unlocks)
    .slice(0, top);
}
