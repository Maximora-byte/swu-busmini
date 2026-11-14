# Transit Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Search operator-published campus locations and jointly recommend usable boarding/alighting stops.

**Architecture:** A pure local stop-search service produces disambiguated suggestions. The journey page turns a confirmed search hit into an existing coordinate endpoint, while retaining exact-stop pickers; the existing planner ranks both ends together.

**Tech Stack:** Existing TypeScript, WXML/WXSS and Node test runner, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-transit-search-design.md`

## Global Constraints

- Use current operator-published data only; preserve stop identities and the shared boarding policy.
- 800-meter radius, nearest six candidates per end, at most six journeys; no ETA or walking-road claims.
- Search input capped at64 characters, at most12 suggestions; no network or personal-data persistence.
- Retain exact-stop selection; no credentials, source internal identifiers or machine artifacts in uploads.

## Review Focus

- Numeric gate/building queries must not become another gate/building through edit tolerance.
- Editing a selected location must invalidate the previous endpoint and discard an in-flight GPS result.
- A stale result click from another field/query must not commit a location.
- A reference point may differ from the best boarding/alighting stop; display both and their straight-line distances.
- Similar names/coordinates must never create new transfer edges or advertise quarantined route visits.

## Task1: Local search and recommendation contracts

Files: create `miniprogram/services/navigation/transit-stop-search.service.ts`, `tests/transit-stop-search.test.ts`; extend `tests/transit-journey.test.ts`.

Interfaces: `createTransitStopSearchService(dataset).search(keyword)` returns `{stopId,name,label,routeNames}` suggestions, plus a current-data singleton. Existing planner coordinate endpoints remain unchanged.

- [x] Write failing tests for normalization, aliases, rank, edit tolerance, numeric mismatch rejection, result limits, exact identities and quarantined route labels.
- [x] Add a synthetic two-coordinate journey where both nearest stops are disconnected and a nearby direct pair is reachable; assert recommended IDs and both connection distances, preserving exact-stop behavior.
- [x] Run targeted tests red; implement the local deterministic search index and matcher; run green.

## Task2: Page search and selection lifecycle

Files: modify journey page TS/WXML/WXSS and `tests/journey-page.test.ts`.

Interfaces: shared input/focus/selection handlers use a field and result generation; confirmed search or map points use coordinate endpoints, manual pickers use stop endpoints. Selected suggestions and map points can automatically replan when both inputs are valid. Explicit map selection state handles valid tap coordinates and cancellation.

- [x] Write failing page tests for select-to-recommend, unconfirmed edits, empty/no-result input, stale clicks, GPS cancellation and manual exact selection.
- [x] Implement field suggestions, explicit selected-mode text, nearby-reference endpoints, per-end connection distances and first-result recommendation badge. Use colored reference circles and fit reference coordinates alongside actual ride markers.
- [x] Add red/green tests and UI for explicit map start/end selection, invalid coordinates, inactive taps, cancellation, stale GPS cancellation and selection-to-recommend flow.
- [x] Verify targeted tests green and preserve current map/location/boarding behavior.

## Task3: Validation and delivery

- [x] Run data sync/validation, typecheck and full test coverage; compile new templates with the installed WeChat compiler and inspect actual search/selection/results in DevTools where available.
- [x] Review the whole feature with a fresh reviewer, fix actionable findings, record actual validation boundaries and update public docs.
- [x] Prepare sanitized upload files, local artifacts and PR description. Record actual push and CI outcome in the PR and local delivery ledger after publication; do not merge or deploy.
