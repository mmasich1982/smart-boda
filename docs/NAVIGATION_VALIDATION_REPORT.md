# Navigation & Structure Validation Report

This report documents what was checked while assembling `smart-boda/` from your five
developer guides, `Mobile_App_Structure.docx`, and `cleaned.html`'s working prototype --
and every place where they disagreed with each other.

## 1. Method

- All 254 code blocks across the Environment Setup guide and Modules A-E were extracted
  programmatically (not retyped by hand), matched to the file paths named inside each guide.
- `cleaned.html`'s prototype router was parsed directly from its JavaScript (58 `case` statements,
  each with its own `screenX()` render function) -- this is the ground truth for "what the
  prototype actually navigates to," independent of what any guide *says* it should do.
- `Mobile_App_Structure.docx` was used as the intended file tree, then cross-checked against
  what the guides actually contain (not assumed to be correct on its own).

## 2. Files present in the zip, by status

| Status | Count | Meaning |
|---|---|---|
| Extracted verbatim | 208 | Pulled directly from your guides' code blocks |
| Merged (appeared in 2+ modules) | 16 | See Section 3 |
| Scaffold / stub (referenced but never coded) | ~20 | See Section 4 |
| New composition/config (package.json, App.jsx, Sidebar.jsx, etc.) | ~15 | Needed to make the pieces runnable together |

## 3. Files that appeared in more than one module, and how they were merged

| File | Modules | Resolution |
|---|---|---|
| `backend/app/main.py` | A, B, (C/D/E inferred) | All router registrations combined; C/D/E's registrations were **reconstructed from the docx file list**, since neither guide showed an explicit `main.py` code block -- **verify these router module names against your actual files.** |
| `backend/app/routers/language.py` | A (base) + A (patch) | Patch appended -- adds `get_translations` endpoint. |
| `backend/app/seed/seed_ui_strings.py` | A, B, C, D, E | Base (A) + each module's additional Kiswahili strings appended. |
| `admin-console/src/pages/MasterDataDropdowns.jsx` | A (base) + A (patch) | Patch appended -- adds Translation Review tab. |
| `rider-app/App.js` | A, B | **B's version used** -- it explicitly supersedes A's ("updated to route between Module A onboarding and Module B main app"). |
| `rider-app/src/components/BackLink.js` | C, D, E | **C/E's version used** (identical, `onPress` prop). **Module D's guide shows a genuinely different, incompatible signature** (`navigation`/`to` props) -- this is a real inconsistency in your source guides, not a merge artifact. Recommend standardizing on the `onPress` version and checking any Module D screens for the old signature. |
| `rider-app/src/components/PaginationControls.js` | B, E | **B's fuller version used** (page-number buttons + ellipsis, matches `cleaned.html`'s `paginationHtml()`). Module E's guide shows a simpler prev/next-only version -- likely an earlier draft. |
| `rider-app/src/theme/colors.js` | C, E | Identical in both -- no conflict, one copy kept. |
| `rider-app/src/hooks/useUrgentAlerts.js` | C (x2), E (x2) | All four "excerpt" contributions composed into one hook, exactly as the guides describe ("merges in" each module's alerts). **Verify the sub-function names match your actual services.** |
| `rider-app/src/offline/syncQueue.js` | A, B, C, D, E | Base (A) + backoff logic (B) + one **merged** `ENTRY_TYPE_ENDPOINTS` map (C+D+E showed this three separate times using `export const`, which would have caused a redeclaration error if pasted as-is) + Module E's statement-verification addition. **Trip/correction/void endpoint paths were inferred from `sb05`/`sb07` router prefixes** since no guide showed this part of the map explicitly -- verify. |
| `rider-app/src/offline/tripsRepository.js` | B (base) + B (patch) | Patch appended -- adds local aggregation/pagination. |
| `rider-app/src/screens/onboarding/LanguageSelectionScreen.js` / `MobileNumberScreen.js` | A (base) + A (illustrative patch) | **Base file used as-is.** The second occurrence in each case used placeholder comments (`"...same state as before..."`) and was clearly a *pattern example*, not a complete file -- pasting it in would have broken the screen. Both patterns are preserved in `docs/i18n_retrofit_examples.md` instead. |
| Alembic version files (Modules C, D, E) | 2 occurrences each | The smaller occurrence in each case was a stray/incomplete match from the extraction process, not real content -- discarded automatically. |

## 4. Files referenced in a folder tree or menu spec, but never given real code anywhere

These are genuine gaps -- named in `Mobile_App_Structure.docx`, a navigator file's own
`import` statement, or your Super Admin Console spec, but with **no corresponding code block
in any of the five guides.** Each has a working stub in the zip, clearly marked `// SCAFFOLD`.

| File | Where it's referenced | Why it matters |
|---|---|---|
| `admin-console/src/api/masterData.js` | Imported throughout `MasterDataDropdowns.jsx` | Without this, the admin console's biggest page can't compile at all. |
| `admin-console/src/pages/PaymentReconciliation.jsx` | Module E's folder tree, your Super Admin Console spec | Core to your manual M-Pesa reconciliation workflow. |
| `backend/app/models/duplicate_plate_case.py` | Module A's folder tree | Backing model for the duplicate-plate admin queue. |
| `rider-app/src/screens/fuelMaintenance/FuelHistoryScreen.js`, `MaintenanceHistoryScreen.js` | Module C's folder tree | Both are in `cleaned.html`'s router too. |
| **Your entire Super Admin Console "Dashboard," "Payments & Reconciliation" (partial), "User & Subscription Management," and "Reporting" sections** | Your message | **The developer guides only ever cover Master Data & Configuration and Rider Account Support in real depth.** Everything else in your menu spec (Main Stats Dashboard, Active Riders List, Subscription Status, Churn Analysis, Re-lock Accounts, Daily Revenue Report, User Engagement Metrics, System Health) has **zero source material** in any guide -- these are the largest genuinely-new scaffolds in the zip. |

## 5. Real gaps found between `cleaned.html`'s prototype and the developer guides

These are the most important findings -- places where the *working prototype* and the
*written guides* actively disagree, not just missing code.

1. **`odometerEntry` -- contradiction.** Module C's guide explicitly states: *"File removed
   in this revision: `OdometerEntryScreen.js` no longer exists as a standalone screen/route...
   folded into `FuelEntryScreen.js` and `BatteryEntryScreen.js`."* But `cleaned.html`'s
   prototype still has a distinct `case 'odometerEntry'` with its own render function. **The
   prototype was not updated to match the later guide revision.** A compatibility shim
   (`OdometerEntryScreen.js`, redirects into the correct fuel-type screen) is included so
   nothing breaks, but recommend removing the standalone route from `cleaned.html` once your
   team confirms the guide's newer approach is final.

2. **`moneyMastery` -- entirely missing.** This case sits in `cleaned.html`'s router
   immediately before `addExpense`/`revenueTargets`/`savingsHub` -- almost certainly meant to
   be the Financial Performance **hub screen** that links to Net Profit, Revenue Targets,
   Savings, and Goals. **No guide, and no line of `Mobile_App_Structure.docx`, mentions this
   screen at all.** This is the single largest structural gap found. A scaffold hub screen is
   included; you'll want to design its actual content.

3. **Savings screens are more granular in the prototype than in the docx.** `cleaned.html` has
   six distinct cases (`savingsHub`, `savingsTypeList`, `savingsEntry`, `addSavingsContribution`,
   `savingsReport`, plus the shared `SavingsAccountScreen`), while the docx describes only
   three files, with a note that `SavingsAccountScreen.js` is "shared by SACCO & Chama via a
   `type` param." It's plausible this consolidation is intentional and several prototype cases
   should map onto the same file -- but `savingsTypeList` and `addSavingsContribution` don't
   obviously fold into any of the three described files. Stubs are included; **recommend you
   decide, screen by screen, which prototype cases are truly duplicates of an existing file
   versus real missing screens.**

4. **`goalAchieved` -- missing.** `Mobile_App_Structure.docx` describes `GoalsScreen.js` as
   combining "My Goals list, New Goal, and Goal Summary" -- three views. `cleaned.html` has a
   fourth, `goalAchieved` (a celebration screen), with no corresponding file or mention
   anywhere. Also note: the real extracted `GoalsScreen.js` exports three **named** functions
   (`MyGoalsScreen`, `NewGoalScreen`, `GoalSummaryScreen`), not the single default-export
   component the docx's phrasing implies -- `FinancialPerformanceNavigator.js` already imports
   it correctly this way.

5. **`renewalPathway` -- missing.** An intermediate step in the document-renewal flow, present
   in `cleaned.html` between `renewDocument` and completion, with no file anywhere in Module E.

6. **`duplicatePlate` (rider-facing) -- missing.** Module A's guide covers the duplicate-plate
   *business logic* (`duplicate_plate_service.py`) and the *admin* queue thoroughly, but never
   shows the rider-facing screen that `cleaned.html`'s `case 'duplicatePlate'` renders.

7. **`syncQueue` (rider-facing) -- missing.** `syncQueue.js` (the offline queue logic) is
   extensively covered, but no guide gives a rider-facing screen to *view* that queue's status,
   which `cleaned.html` has as its own case.

## 6. A real bug found and fixed during assembly (not a gap -- an actual defect)

`rider-app/src/navigation/MainNavigator.js`, as written in Module B's guide, imports
`AccountLockedScreen` from `'../screens/AccountLockedScreen'` -- but the real file (per the
folder structure every other module agrees on) lives at
`'../screens/settings/AccountLockedScreen'`. As originally written, this import would have
failed at build time. **Fixed** in the assembled repo, with a `// FIX` comment marking exactly
what changed.

A second, more structural issue: `App.js` (Module B) says in a comment that `OnboardingNavigator`'s
`"Home"` screen entry `"now points at MainNavigator's Home"` -- but `OnboardingNavigator.js`
(Module A) still pointed `"Home"` directly at the plain `HomeScreen` component, not at
`MainNavigator`. As written, reaching "Home" from onboarding would never have given the rider
access to trips, fuel, financial performance, compliance, or settings at all -- **the entire
rest of the app was structurally unreachable.** This has been fixed by nesting `MainNavigator`
as the `"Home"` screen, and `MainNavigator` itself has been extended with entry points into
the four module navigators (`FuelMaintenanceNavigator`, `FinancialPerformanceNavigator`,
`ComplianceHistoryNavigator`, `SettingsNavigator`) plus the newly-scaffolded `MoneyMastery`,
`SyncQueue`, and `DuplicatePlate` screens -- since no guide ever wrote this top-level
composition.

## 7. Minor documentation correction

`Mobile_App_Structure.docx` lists `TermsOfServiceScreen.js` and `DataPrivacyScreen.js` as
**"NEW"** files under Module E's `screens/settings/` folder. In reality, no guide gives separate
code for these -- `SettingsNavigator.js` imports them from `screens/settings/`, while the only
real implementation is Module A's `screens/legal/`. Thin re-export wrapper files have been
added at the `settings/` path so both navigators resolve correctly without duplicating the
legal text in two places. Recommend correcting the docx to note these are **reused**, not new.

## 8. Recommended next steps, in priority order

1. Resolve the `moneyMastery` and savings/goals granularity gaps (Section 5, items 2-4) --
   these affect the most-used part of the app.
2. Decide on `BackLink.js` and `PaginationControls.js`'s canonical signatures (Section 3) and
   sweep any screens still using the discarded versions.
3. Build out the Super Admin Console's Dashboard, Payments, Users, and Reporting sections
   (Section 4) -- currently the largest all-new scaffold surface in this codebase.
4. Verify the reconstructed `main.py` router list and `syncQueue.js`'s `ENTRY_TYPE_ENDPOINTS`
   map against your actual backend router files (both were partly inferred, not extracted).
5. Update `cleaned.html` to remove the standalone `odometerEntry` route once Module C's
   consolidated approach is confirmed as final.
