# Standard assessment banks

Fixed, validated item banks behind the standard assessments (`src/modules/quizzes/assessments.ts`). The AI never
writes these questions; it only writes the candidate report from the computed scores.

| File | What | Source | Licence |
|---|---|---|---|
| `omib.json` | 220 figural matrices (3×3 grid; build the missing cell from 20 construction elements), each with its rules and 2PL IRT parameters (`a`, `b`); `cells[8]` is the answer | Open Matrices Item Bank: Koch, Spinath, Greiff & Becker (2022), *Journal of Intelligence* 10(3):41, https://osf.io/4km79/ ("Item Data.xlsx") | GPL-3.0 |
| `ipip.json` | Six inventories: IPIP-NEO-120 (Johnson, 2014), Mini-IPIP (Donnellan et al., 2006), IPIP HPI proxies (workplace style, role potential), IPIP HEXACO Honesty-Humility facets (integrity), Barchard (2001) emotional intelligence | International Personality Item Pool, https://ipip.ori.org/ (scoring-key pages) | Public domain, any use (https://ipip.ori.org/newPermission.htm) |

Notes:
- OMIB item 7 has no IRT parameters (almost everyone solves it); it is the worked example on the intro.
- Reasoning percentiles compare with the OMIB calibration sample (N = 2,572 German medical-school applicants), so
  they run conservative for the general population. Say so wherever a percentile is shown.
- IPIP publishes no norms. Scale scores are 0-100 on the scale's own range (1-5 Likert, reverse keys applied).
- One HPI item on the IPIP page lacks its full stop ("Often feel blue"); it was added during conversion.
