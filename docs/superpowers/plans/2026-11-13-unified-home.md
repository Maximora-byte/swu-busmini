# Unified Campus Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** One current-data home combines campus map browsing and journey planning with unambiguous route legends.

**Architecture:** A pure current-transit map presentation module derives route stop lists, network overlays and legends. The existing journey page owns shared map/tab/plan state; the legacy index redirects. Preserve historical data/services without exposing the old planner as a second current UI.

**Tech Stack:** Existing TypeScript/WXML/WXSS, no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-unified-home-design.md`

## Global Constraints

- Current operator data and exact visit identities only; preserve all coordinates/geometry and eligibility policy.
- No invented operating directions, closure edges, network requests or personal-data persistence.
- Current viewport bounds and stale camera/location protection remain; preserve confirmed endpoint/plan state on tabs.
- FormalAppID stays in local release candidate only; no source captures, credentials, user screenshots or machine paths in GitHub.

## Review Focus

- Different map modes must show legends for what is actually drawn, not a stale selected line.
- A plan must survive round trips through campus map browsing without reviving invalid endpoints.
- Quarantined visits remain visible but cannot supply route-specific boarding actions.
- Reverse station list retains source visit identity, including repeat occurrences.
- Old entry redirects safely without automatic GPS or old navigation dependencies.

## Task1: Current map presentation

Files: new `services/map/current-transit-map.service.ts`, `tests/current-transit-map.test.ts`.

Produces current route detail/visit list plus overlay points, route legend and stop IDs from the validated dataset.

- [x] Write and observe failing tests for selected/all ten routes, defensive geometry, reverse occurrence keys and eligibility.
- [x] Implement pure presentation functions; targeted tests pass.

## Task2: Unified page and old-entry migration

Files: journey TS/WXML/WXSS; index TS/WXML/WXSS; journey/runtime tests.

- [x] Add failing tests for map/network modes, geometric reverse lists, stop focus/actions, legends, tab restoration, source identity and safe redirect.
- [x] Integrate same-page tabs, overview toolbar, map list, route legend, stop actions and collapsible data notes. Preserve planning/location/search handlers.
- [x] Replace old index UI with redirect; archive old page artifacts locally and replace obsolete page tests while retaining historical service tests.
- [x] Pass targeted tests and native WXML/WXSS compilation.

## Task3: Verify and deliver

- [x] Run full quality/coverage checks and actual-AppID automation; inspect overlays, tabs, legends, stop actions and journey flows.
- [x] Fresh review, regression fixes, upload sanitation, public notes and full local preservation.
- [x] Prepare the focused PR and tested upload candidate under existing user authorization. Record actual commit/push, CI and upload outcomes in the PR and local release ledger; do not equate developer upload with experience promotion or publication.
