# Direction and Geometry Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Prevent unconfirmed off-route boarding recommendations and accurately describe direction/near-loop evidence.

**Architecture:** One shared visit eligibility policy is consumed by planner and UI. Import diagnostics add evidence-based warnings; source coordinates and geometry stay immutable. No loop-operating edges are inferred.

**Tech Stack:** Existing TypeScript / WeChat templates / Node tests; no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-direction-closure-check-design.md`

## Constraints and review focus

- Preserve raw static acquisitions locally; publish only sanitized review conclusions and public facts.
- No moving 3B coordinates, borrowing another route's branch, inventing closures, or claiming verified operating directions.
- A quarantined visit is route-scoped; other routes at the same physical identity remain usable.
- Planner endpoint, transfer, coordinate candidates and UI route labels use the same <=35m eligibility policy.
- Near-return detection excludes the final200m adjacent stretch; near geometry does not authorize cyclic service.

## Task 1 — Route diagnostics

Files: scripts/current-transit-data.ts, import tests, regenerated current-transit.json/.ts.
- [x] Add failing diagnostics tests for stem+near-loop, adjacent endpoint exclusion and published 3B warning.
- [x] Implement deterministic near-return diagnostics and clear quarantine warning; preserve input point arrays.
- [x] Run import/repository/sync tests and prove public source/geometry unchanged.

## Task 2 — Boarding quarantine

Files: new services/navigation/transit-visit-policy.ts, transit-journey.service.ts and tests.
- [x] Add failing actual-data/synthetic tests for off-route endpoints, transfer, intermediate visits and unaffected shared stops.
- [x] Implement MAX_AUTOMATIC_BOARDING_OFFSET_METERS=35 and isAutomaticBoardingVisit; use it throughout planner.
- [x] Verify <=35m boundary and valid 3B/3 journeys, no source mutations.

## Task 3 — UI and evidence

Files: journey page/templates/tests and public review notes.
- [x] Add failing UI tests for planning labels/markers and route-scoped quarantine.
- [x] Integrate shared policy, show uncertain point at original position, display direction/geometry review status.
- [x] Publish sanitized evidence notes, update source-quality docs, compile templates.

## Task 4 — Ship

- [x] Run sanitation, sync, validation, typecheck and full coverage.
- [ ] Independent review, regression fixes, commit and update PR10; inspect CI/Codecov.
- [ ] Preserve all raw/static/code/test artifacts locally in a new archive; keep original archives, no merge/deploy.
