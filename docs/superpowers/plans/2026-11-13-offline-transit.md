# Offline Transit Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan and display offline SWU bus journeys from actual operator-published static data.

**Architecture:** Separate current dataset/repository and journey service from historical graph. New default journey page consumes only sanitized current data and shows cropped ride geometry and boarding/alighting stops.

**Tech Stack:** Existing TypeScript, WXML/WXSS, Node tests, no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-offline-transit-design.md`

## Global Constraints

- Preserve all static source snapshots/tools locally; no credentials, personal records, provider account IDs, local paths or decompiled source/assets in PR.
- Never infer closure or fill missing roads; source/client mileage direction semantics are stated explicitly.
- Current operator-published quality differs from historical manually reviewed data; keep repositories separate.
- No live vehicles, ETA, paid maps, merge or deployment.

## Review Focus

- Coordinate endpoints outside service range produce no misleading boarding recommendation.
- No same-name cross-road merges, zero-distance bus legs, or old POI/geometry contamination.
- Repeated station occurrences, reverse traversal and exact boarding/alighting anchors retain correct clipped geometry.
- Async location and map callbacks cannot override newer endpoint/route/plan or hidden page.
- All public data outputs pass a schema/PII allowlist; preserved local snapshots are never committed.

## Task 1 — Current data import and repository

Files: new models/current-transit.ts, data/current-transit-source.json, current-transit.json/.ts, scripts/current-transit-data.ts, import-current-transit.ts, repository/current-transit.repository.ts, tests; sync-data.ts integration.

- [x] Write failing import/repository tests for real fields, projection, duplicates, range, placeholder rejection and secret stripping.
- [x] Implement explicit sanitized source transform; pair actual geometry by provider line identity before stripping identifiers. Exact-name+rounded-coordinate stop IDs. Keep source indices and projected anchors; forward visits sort by mileage. Unknown fields are rejected/stripped.
- [x] Generate deterministic runtime dataset/adapters; verify affected tests and sync.

## Task 2 — Offline journey planner

Files: new services/navigation/transit-journey.service.ts and tests. Uses model interface pinned in spec.

- [x] Write failing direct/reverse/one-transfer/clipping/coordinate-candidate tests with synthetic data.
- [x] Implement planner factory and bounded candidates; preserve visit indices and slice exact operator geometry; no unprovided wrap/straight-road interpolation.
- [x] Reject zero-distance rides, same-ID transfer assumptions and invalid inputs; verify all cases and actual-data representative journeys.

## Task 3 — Default journey UI

Files: new pages/journey files and tests; app.json, historical index entry/README.

- [x] Write failing runtime tests for actual dataset, route/stop selection, results, location errors and stale callbacks.
- [x] Implement route overview and ride-section map, station pickers/current position, direct/one-transfer cards and open stop location; retain safe historical entry.
- [x] WXML/WXSS compile and affected tests pass.

## Task 4 — Verification and PR

- [x] Run source sanitation, data sync, data validation, typecheck and full coverage tests.
- [ ] Independent whole-branch review and regression fixes.
- [ ] Commit/push and open PR against main, noting the PR9 foundation (existing CI only triggers for main-targeted PRs); inspect CI; leave unmerged and report data/real-device limitations.
