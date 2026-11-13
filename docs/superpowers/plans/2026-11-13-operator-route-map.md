# Operator Route Catalog and Map Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the user-confirmed current route catalog and make historical map directions and stop interaction clearer.

**Architecture:** Keep operator observations separate from ordered navigation data. A repository exposes validated offline observations; the index page adds a catalog tab and retains existing navigation/camera gates. Map stop selection uses a stable stop-to-marker mapping.

**Tech Stack:** Existing TypeScript, WeChat WXML/WXSS, Node test runner; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-operator-route-map-design.md`

## Global Constraints

- No private API calls, paid geocoding, generated coordinates, decompiled source/assets, credentials or personal cache data.
- Preserve existing reviewed-coordinate and geometry gates, local uncommitted files, and CI.
- The operator observation is a set of reference labels, never ordered navigation stops or proof that 9路 stopped.
- User authorization covers implementing the prior recommendations and opening a PR, not merge/deploy.

## Review Focus

- Unknown catalog IDs and malformed dates/labels are rejected or ignored without corrupting the page.
- Selecting catalog-only lines never silently displays another route's geometry.
- Repeated stop visits share a marker identity; changing direction must retain identity for the same stop.
- Missing coordinates and delayed setData callbacks cannot move the camera to stale or guessed positions.
- Older 2025 route plans remain explicitly distinguished from current operator observations.

## Task 1: Validated operator catalog

Files: new `miniprogram/data/operator-routes.json` and generated `.ts`; model/repository files; adapter sync and tests.

Interfaces: `operatorRouteCatalogRepository.getAll(): OperatorRouteObservation[]`, `getById(id): OperatorRouteObservation | undefined`; each observation has `id`, `name`, `source`, `observedAt`, `confirmation`, `referencePointNames`. Confirmation applies only to names/reference-label sets. IDs use existing route_1..route_8 plus route_3b and route_jingguan.

- [ ] Write tests for ten exact line names, original composite labels, dates, defensive copies, duplicate IDs and bad records; observe RED.
- [ ] Implement minimal validated repository and offline data adapter; verify GREEN and sync check.

## Task 2: Stable map-stop selection

Files: `route-map-presentation.service.ts`, `pages/index/index.ts`, related presentation/runtime tests.

Interfaces: marker exposes stable ID and stopId; page `handleStopTap` / `handleMarkerTap` select a verified stop, update highlight and camera using cameraRequestVersion. Missing positions provide feedback without setting coordinates.

- [ ] Add failing behavioral tests for identity across direction change, repeated visits, invalid taps, missing coordinate and stale selection callbacks.
- [ ] Implement stable mapping and page selection with cleanup on route/direction changes; verify tests.

## Task 3: Catalog and concise map controls

Files: index WXML/WXSS/TS, runtime tests, README and data source notes.

Interfaces: third `catalog` tab, catalog selection state, map options expanded state; direction buttons reuse summary. Catalog is independent of navigation route selection.

- [ ] Add failing runtime checks for catalog selection and hidden-map camera cancellation.
- [ ] Add ten-line offline catalog, source/date/scope text, compact direction summaries, folded auxiliary controls and selectable stop rows; remove duplicate direction controls.
- [ ] Document current versus 2025 navigation data without inferring operation status.

## Task 4: Verification, review and PR

- [ ] Run check:data-sync, validate:data, typecheck and test:coverage; inspect results.
- [ ] Request independent whole-branch review; resolve consequential findings with regression tests.
- [ ] Commit only task files, push codex/operator-route-map and open one focused PR; inspect CI and report actual status. Do not merge.
