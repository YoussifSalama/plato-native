// Where the landing sends people. The app lives on jobs.platohiring.com.
export const APP = "https://jobs.platohiring.com";
export const SIGNUP = `${APP}/signup`;
export const LOGIN = `${APP}/login`;
export const PRIVACY = "/privacy/";
export const TERMS = "/terms/";
export const CONTACT = "raefalwani06@gmail.com";

export const NAV = [
  { href: "/features/", label: "Features" },
  { href: "/extension/", label: "Extension" },
  { href: "/how-it-works/", label: "How it works" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/security/", label: "Trust" },
];

// Real source labels from plato-job-seeker-native-fe lib/jobs/api.ts (SOURCE_LABEL), with a tint each.
export const SOURCES: [string, string][] = [
  ["LinkedIn", "#0a66c2"], ["Indeed", "#2557a7"], ["Google Jobs", "#4285f4"], ["Workable", "#1a9e8f"], ["Lever", "#1e1d2b"], ["Greenhouse", "#24a47f"],
  ["Ashby", "#5b4cf0"], ["Glassdoor", "#0caa41"], ["ZipRecruiter", "#4a90e2"], ["Wellfound", "#e5484d"], ["Wuzzuf", "#0055d9"], ["Bayt", "#e55b13"],
  ["Remote OK", "#ff4742"], ["SmartRecruiters", "#00a3ad"], ["Recruitee", "#1999e3"], ["Teamtailor", "#f2416b"], ["Personio", "#1e1d2b"], ["BambooHR", "#73c41d"],
];

export const PLANS = [
  { id: "free", name: "Free", price: 0, tokens: "1,000", items: ["Search every source, match scores", "Chrome extension, applying is free", "Job alerts and digests", "Mock interviews within your credits"], cta: "Start free" },
  { id: "pro", name: "Pro", price: 19, tokens: "7,000", items: ["Everything in Free", "Resumes tailored per posting", "Voice interviews and scorecards", "Prove a skill, earn it on your CV"], cta: "Go Pro", hi: true },
  { id: "max", name: "Max", price: 59, tokens: "25,000", items: ["Everything in Pro", "Room for daily searching", "Top-ups never expire"], cta: "Go Max" },
];
export const PACKS = [["1,000", 5], ["3,000", 12], ["10,000", 35]] as const;
