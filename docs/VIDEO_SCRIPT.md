# Demo video script (10 minutes maximum)

Record at 1080p with the browser at about 1440 px wide. Open the deployed app before you start. Each part has about 4½ minutes of narration, which leaves some slack. Speak at a relaxed pace: about 600 words fits in 4½ minutes.

---

## Part 1: Client pitch (target 4:30, maximum 5:00)

**Audience:** the utility's day-ahead trading team. **Goal:** show them a tool they want to use tomorrow morning.

| Time | On screen | Say |
|---|---|---|
| 0:00 | Title slide or the app header | "Every morning before 09:20 your desk decides how much power to buy for tomorrow. Wind can supply anything from 2 to 18 gigawatts, so the forecast you trust at that moment drives your whole position. In this pilot we looked at every one of those decisions you made in January 2026." |
| 0:25 | **Day-ahead** tab, 15 Jan, point at the timeline | "This is the screen for the morning decision. Pick a delivery day, here the 15th. The timeline shows the day before: every forecast Elexon published, the 09:20 gate, and the one you actually had, the 07:30 publish. The 09:30 forecast arrived after bids closed, so it is not used. Nothing published later leaks in." |
| 0:55 | Point at the key figures and the shaded band | "Tomorrow's wind energy is 279 gigawatt-hours. More useful is the shaded band: an 80% likely range built from how far January forecasts actually missed. You plan against a range, not a single line." |
| 1:20 | The black Actual line on the chart, then step through a few days with the arrows | "Because this is a review of January, we can switch on what actually happened. Step through the days and a pattern appears: the outturn keeps landing below the forecast." |
| 1:45 | Switch the **Deadline** menu to N2EX 09:50 and watch the timeline move | "You can also change the deadline. With N2EX at 09:50 you get the 09:30 forecast, which arrives ten minutes too late for EPEX. The tool shows what that extra forecast is worth." |
| 2:10 | **Accuracy** tab, the three key findings | "Here's the headline. At your deadline the forecast over-estimated wind in 85% of hours, by 1.7 gigawatts on average. Typical hourly error is about 2 gigawatts, and 9 hours in 10 are within 4.2 gigawatts. Every over-forecast is wind you have to buy back later, usually at intraday or imbalance prices." |
| 2:50 | "Where the error comes from": Lead time, then Hour of day | "Error grows steadily with lead time. Your decision sits in this shaded band, 16 to 40 hours out. Errors also peak in the early-morning hours." |
| 3:15 | Switch to Distribution | "The error distribution is skewed to the right. Big misses are almost always over-forecasts, which is exactly the costly direction for you." |
| 3:35 | Expand "Detailed accuracy metrics" (Forecast vs Adjusted), then the Day-ahead chart with **Adjusted** switched on | "We also tested a simple correction: scale the forecast by how it performed over the last seven fully settled days, using nothing you wouldn't have known at 09:20. That cuts the average error by 30%, from 2.0 to 1.4 gigawatts." |
| 4:05 | Expand "Day-by-day scorecard", click a day tagged "Outside range" (e.g. 11 Jan), then **CSV** | "Every day is one click away for post-trade review, and the hourly numbers export to CSV for your own models." |
| 4:20 | Back to the top | "Next steps: connect this to live Elexon data every morning, add your demand forecast so the screen shows a recommended buy volume, and price the risk in pounds. Thank you." |

---

## Part 2: Technical review (target 4:30, maximum 5:00)

**Audience:** the tech lead. **Goal:** a review that's easy to follow, plus a knowledge transfer.

| Time | On screen | Say |
|---|---|---|
| 0:00 | README in the GitHub repo | "The repo has a Python FastAPI backend with pandas, a React and TypeScript frontend, and one Docker image that serves both. The README covers layout, run commands and deployment. docs/ARCHITECTURE.md has the design detail." |
| 0:25 | Architecture diagram in docs/ARCHITECTURE.md | "Data flow: a fetch script pulls FUELHH wind and WINDFOR from Elexon with async, chunked and retried calls. The result is saved as a CSV snapshot, then cleaned into UTC pandas frames. The analytics layer computes views that are served under a versioned api/v1 prefix with pydantic contracts. The snapshot is deliberate: January is fixed history, so the app is fast, reproducible and independent of Elexon uptime." |
| 1:05 | `backend/app/analysis.py`: `latest_forecast_asof` and `cutoffs_for_targets` | "The core rule is no look-ahead. For every target hour we take the latest forecast published at or before the cutoff. That's one merge_asof grouped by target time, so it's vectorised and runs in milliseconds. The decision cutoff is the deadline on D minus 1 in UK local time, computed in naive local time and then localised, so clock-change days are correct. The horizon view reuses the same join with the cutoff at t minus h." |
| 1:45 | Same file: `error_metrics`, `apply_band`, `trailing_ratios` | "Error is forecast minus actual, so a positive error means the desk is short. The 80% band uses empirical error quantiles from the other days, and coverage is measured leave-one-day-out: 77.7% against an 80% target. The adjusted forecast uses only days D minus 8 to D minus 2, which were fully settled at the deadline. I tested additive and multiplicative variants. Multiplicative won, which fits the over-forecast growing with wind level." |
| 2:30 | `backend/tests/conftest.py` and `test_snapshot.py` | "Testing has three layers. Unit tests run on synthetic data where every forecast value encodes its publish time, so tests assert exactly which publish was chosen. API contract tests check status codes and payloads. And invariant tests on the real snapshot assert that no publish after the cutoff is ever used, with full 31-by-24 coverage at three deadlines." |
| 3:05 | `frontend/src`: App.tsx, `api/queries.ts`, `lib/` | "Frontend: TanStack Query holds server state with an infinite stale time, since the data is immutable. View state lives in the URL, so links are shareable. Times are always shown in Europe/London, and there are tests across GMT and BST. Recharts draws the charts. The slider is debounced and derived arrays are memoised." |
| 3:40 | `.github/workflows/ci.yml`, `Dockerfile` | "CI runs ruff, pytest, tsc, vitest, the production build, then builds the Docker image and smoke-tests it. The Dockerfile is multi-stage: Node builds the UI and a slim Python image serves it as a non-root user, with a health check. The PORT variable is honoured for Heroku, and Vercel uses the split static-plus-function config." |
| 4:10 | ARCHITECTURE.md sections 8 and 9 | "Trade-offs and next steps are written down. For production: scheduled ingestion into Postgres with freshness alerts, rolling calibration by lead time and wind level, demand and price data for a buy recommendation, and auth with tracing. Thanks for reviewing." |

---

### Recording checklist

- [ ] Deployed URL opens in an incognito window
- [ ] Repo is public with an anonymous name, and the README links to the app and the video
- [ ] Browser zoom at 100%, notifications off, the app already loaded so there's no cold-start delay
- [ ] YouTube visibility set to **Unlisted**, total length 10:00 or less
