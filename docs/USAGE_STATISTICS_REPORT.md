# Usage Statistics per Functionality (Estimated) & Prioritization

## Important caveat, read first

**Smart Boda has no production analytics/telemetry yet**, so the numbers below are not
measured -- they're a reasoned estimate based on (a) how often a rider naturally encounters
each workflow in a real boda boda business day, (b) how central each module is to the app's
core value proposition, and (c) how much of the codebase each module represents (a rough proxy
for how much the team has already invested in it). Treat this as a **prioritization tool**,
not real usage data -- and see Section 4 for how to replace it with real numbers within your
first month of live usage.

## 1. Estimated usage frequency, per active rider

| Functionality | Module | Est. frequency per rider | Basis for estimate |
|---|---|---|---|
| Log a trip (fare + payment method) | B | 8-25x per day | Every completed ride, all day, every working day |
| View daily trade summary | B | 1-3x per day | Natural end-of-shift and mid-shift check-ins |
| PIN login (app re-open) | A | 5-15x per day | Riders check the app between rides constantly |
| Fuel/charging entry | C | 1-3x per day (petrol/swap), 1x per day (electric charging) | Matches real refueling/charging habits |
| Odometer reading | C (folded into fuel/battery entry) | Same frequency as fuel entry | No longer a separate screen per Module C's latest revision |
| Net profit dashboard view | D | 1x per day | Natural end-of-day check |
| Add other expense | D | 2-5x per week | Irregular, as expenses actually occur |
| Savings contribution | D | 1-4x per week | Matches typical SACCO/Chama contribution cadence |
| Revenue target check-in | D | 1x per day to 1x per week | Depends on whether rider has set a target at all |
| Goal tracking / contribution | D | 1-2x per week | Slower-moving than daily trip data |
| Send money home | D | 1x per week to 1x per month | Matches typical remittance cadence in this context |
| Maintenance entry | C | 1-4x per month | Matches real service intervals, far less frequent than fuel |
| Document compliance check / renewal | E | 1x per month to 1x per year, per document type | Matches real insurance/license renewal cycles |
| Financial history / transaction list | E | 1-4x per month | Occasional review, not daily |
| Generate/view statement | E | 1x per month | Matches typical reporting cadence (e.g. for a SACCO or loan application) |
| Data export request | E | Rare -- a handful of times per rider, ever | One-off compliance/portability need |
| Subscription / payment (M-Pesa code entry) | E | 1x per billing cycle (weekly or monthly, per your pricing) | Directly tied to your subscription frequency options |
| Suggestions/feedback | E | Rare, opportunistic | Not a routine workflow by nature |
| Settings / account management | A/E | A few times per month | Occasional, not routine |
| Onboarding (language, bike profile, phone, PIN) | A | Once per rider, ever (plus rare PIN recovery) | One-time setup, high-stakes first impression |

## 2. Criticality ranking (independent of raw frequency)

Some workflows are used less often than trip logging but would be far more damaging if broken
-- this ranking is about **business risk**, not frequency.

| Rank | Functionality | Why it ranks here |
|---|---|---|
| 1 | Trip logging (Module B) | The single highest-frequency action in the entire app; any bug here is felt by every rider, every day. |
| 2 | Subscription / M-Pesa reconciliation (Module E) | Directly gates whether a rider can use the app at all, and is your entire revenue mechanism -- see your grace-period requirement from the deployment roadmap. |
| 3 | PIN login / onboarding (Module A) | If broken, a rider can't get into the app at all -- the true front door. |
| 4 | Fuel/charging entry (Module C) | Second-highest frequency after trips; feeds directly into net profit accuracy. |
| 5 | Net profit dashboard (Module D) | The main "why am I using this app" payoff screen for many riders. |
| 6 | Compliance/document tracking (Module E) | Lower frequency, but a missed insurance/license renewal has serious real-world consequences for the rider. |
| 7 | Savings & goals (Module D) | Meaningful for rider financial health, but not day-to-day operationally critical. |
| 8 | Statements & financial history (Module E) | Valuable for trust and record-keeping, but rarely the reason a rider opens the app on a given day. |
| 9 | Suggestions/feedback, settings | Supporting functionality -- important for product improvement, not core daily use. |

## 3. What this means for your build/QA priority (tying back to the validation report)

Cross-referencing this with `docs/NAVIGATION_VALIDATION_REPORT.md`'s gap list:

- The **`moneyMastery` hub gap** sits right at the entry point to Module D (rank #5 above) --
  worth resolving before the savings/goals granularity questions, since it's the doorway
  riders will use daily/weekly to reach those lower-frequency screens.
- The **Super Admin Console's missing Dashboard/Payments/Reporting sections** map directly onto
  your #2-ranked functionality (subscription/reconciliation) -- these should be your team's next
  build priority after core rider-app gaps, since they're what makes reconciliation operationally
  sustainable at more than a handful of riders.
- **`FuelHistoryScreen`/`MaintenanceHistoryScreen` stubs** (rank #4/#6) are lower-urgency than the
  entry-flow gaps above, since riders will notice a missing *history* view far less than a broken
  *entry* flow.

## 4. Replacing these estimates with real numbers

Once even a small cohort of riders is active (your 100 closed testers are a good start), add a
lightweight event-logging table so this report can be regenerated from real data instead of
estimates:

```sql
CREATE TABLE app_usage_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID REFERENCES rider(id),
    screen_name TEXT NOT NULL,
    event_type TEXT NOT NULL,       -- 'screen_view', 'action_completed', etc.
    occurred_at TIMESTAMPTZ DEFAULT now()
);
```

Log a row from each screen's `useEffect` on mount, and from each key action (trip saved, fuel
entry saved, M-Pesa code submitted, etc.). After 2-4 weeks of real closed-testing data
(Part 4 of your deployment roadmap), a simple `GROUP BY screen_name, DATE_TRUNC('day', occurred_at)`
query replaces every estimate in Section 1 with real numbers -- and directly powers the
`UserEngagementMetrics.jsx` admin page that's currently a scaffold.
