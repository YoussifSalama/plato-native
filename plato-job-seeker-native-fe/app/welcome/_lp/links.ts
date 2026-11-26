// Where the job-seeker landing sends people: this app's own pages. The legal pages stay on platohiring.com.
// The front door is the no-account search; signing up later keeps the CV and the search.
export const SEARCH = "/search";
export const SIGNUP = "/signup";
export const LOGIN = "/login";
const SITE = "https://platohiring.com";
export const PRIVACY = `${SITE}/privacy/`;
export const TERMS = `${SITE}/terms/`;
export const SECURITY = `${SITE}/security/`;
export const CONTACT = "raefalwani06@gmail.com";

// One page: the nav jumps to its sections.
export const NAV = [
  { href: "#story", label: "How it works" },
  { href: "#inside", label: "Inside" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

// Boards the search really uses (plato-native-be discovery adapters; labels as in the app's SOURCE_LABEL). Which of
// them a search reaches depends on the seeker's country, so the page never promises a count.
export const SOURCES: [string, string][] = [
  ["LinkedIn", "#0a66c2"], ["Indeed", "#2557a7"], ["Google Jobs", "#4285f4"], ["Glassdoor", "#0caa41"], ["Wuzzuf", "#0055d9"], ["Bayt", "#e55b13"],
  ["GulfTalent", "#0b6e4f"], ["Naukrigulf", "#4a90e2"], ["Greenhouse", "#24a47f"], ["Lever", "#1e1d2b"], ["Ashby", "#5b4cf0"], ["Workable", "#1a9e8f"],
  ["Wellfound", "#e5484d"], ["Built In", "#2b6cb0"], ["ZipRecruiter", "#4a90e2"], ["Remote OK", "#ff4742"], ["We Work Remotely", "#1e1d2b"], ["Himalayas", "#5b4cf0"],
];

// Every feature is on every plan; plans differ by tokens. Paid plans can't be bought yet (payments are off in the
// API, credits.service.ts), so they show as coming soon.
export const PLANS = [
  { id: "free", name: "Free", price: 0, tokens: "1,000", items: ["Search, ranking and match scores", "The Chrome extension applies for free", "Tailored CVs and interview practice", "Job alerts"], cta: "Start free", hi: true },
  { id: "pro", name: "Pro", price: 19, tokens: "7,000", items: ["Everything in Free", "7x the tokens for searching, CVs and interviews"], cta: "Coming soon", soon: true },
  { id: "max", name: "Max", price: 59, tokens: "25,000", items: ["Everything in Free", "Room for searching every day"], cta: "Coming soon", soon: true },
];
export const PACKS = [["1,000", 5], ["3,000", 12], ["10,000", 35]] as const;
