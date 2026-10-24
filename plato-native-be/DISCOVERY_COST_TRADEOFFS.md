# Cost/coverage tradeoffs — decisions for the business owner

Context: discovery cost per seeker ranges $0.56 (default budget) to $3.30
(max cap), see [DISCOVERY_COST_REPORT.md](DISCOVERY_COST_REPORT.md). Each
row below is an independent lever — they can be combined.

| # | Option | Cost impact | Result-coverage impact | Engineering cost | Risk |
|---|---|---|---|---|---|
| A | Raise `budget` (current knob) | Cost scales ~linearly, up to ~6× at max cap | More records/run (5 → 40), same boards/titles searched | None — already exists, just a config value | None technical; pure spend decision |
| B | Weight board fan-out — full 3 titles on the 5 cheap boards (Talent/JobBank/Dice/Handshake/Wuzzuf), 1 title on the 3 expensive ones (Glassdoor/ZipRecruiter/BuiltIn) | ~30-40% cut vs even split, same total budget | Same board count, less depth on the pricey ones | Small — change `MAX_TITLES` logic to be per-board, not global | Fewer title variants on Glassdoor/ZipRecruiter/BuiltIn = may miss postings only they carry |
| C | Drop the 3 most expensive boards entirely (Glassdoor $0.21, ZipRecruiter $0.174, BuiltIn $0.12+/call) | ~25-30% cut (their share of the per-call sum) | Loses whatever unique postings those 3 boards surface that nobody else does | Small — remove from `BOARDS` array | Silent coverage loss — no way to know what was missed without a before/after audit |
| D | Cache/share identical searches across seekers (same title+country+source, TTL window e.g. 6-12h) | Scales with seeker overlap — could cut cost by the number of seekers sharing a query, biggest lever of all | None if TTL short enough — same job pool, fresher than a typical daily search cadence | Medium — new cache layer keyed on (title, country, source), invalidation logic | Staleness — a seeker's search could reuse a result up to TTL-old; a caching bug could leak one seeker's improperly-scoped result to another if not keyed correctly |
| E | Switch some/all boards to a non-Apify provider (cheaper or bundled pricing) | Unknown until researched — see below | Depends on provider's own coverage/freshness | Medium-large — new adapter per provider, re-test normalization | Vendor risk: new provider's data quality/uptime unproven vs current actors already live-tested |
| F | Reduce `MAX_TITLES` (board scrapers: 3→2, LinkedIn: 6→4) | Cuts board-scraper cost ~33%, LinkedIn cost ~33% | Fewer title variants searched per seeker — may miss adjacent-role postings (e.g. "Backend Developer" search but not "Node.js Developer") | Trivial — one constant change | Direct precision/recall tradeoff, easy to A/B test |

## Recommended combination (not a decision, just the shortest path to meaningful savings with least risk)

**B + F together**: weight cheap boards higher, cut title fan-out from 3→2
on the pricier ones. No new infra, ships in an afternoon, cuts cost
meaningfully without the staleness risk of caching or the vendor risk of
swapping providers. **C** (dropping boards outright) and **D** (caching)
are the higher-payoff, higher-risk options worth a deliberate go/no-go
from the business owner rather than a default.
