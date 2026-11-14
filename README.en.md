<a id="top"></a>
<div align="center">

# SWU Go

[简体中文](README.md) | English

**Campus bus navigation for Southwest University's Beibei campus: choose stops, compare direct and one-transfer rides, and view the segment to ride.**

<sub>WeChat Mini Program · TypeScript · Unofficial open-source project · MIT</sub>

[Quick start](#quick-start) · [Status](#status) · [Development](#development) · [Data maintenance](#data-maintenance) · [CI](#ci) · [Safety](#safety)

</div>

SWU Go is an unofficial, open-source WeChat Mini Program for campus bus navigation at Southwest University's Beibei campus. It addresses where to board, which route and direction to take, and where to get off, while remaining usable without real-time vehicle data.

> This is an unofficial student-developed project, with no affiliation with or authorization from Southwest University.

<a id="status"></a>
## Current status

The default entry combines the **campus map and trip planner** on one full-screen map with floating search and a three-position bottom sheet. It uses ten routes, 162 stop visits, 103 source stop identities and 682 track points published by the operator on 2026-11-13. Direct and one-transfer planning works locally without live vehicle data. Access and egress distances are straight-line estimates, not walking directions or arrival predictions. See [offline navigation and data boundaries](docs/offline-transit-2026-11-13.md).

The map displays those 103 source records as 53 station-area entries. Tapping an entry shows serving routes and boarding/alighting choices. All 162 visits, original coordinates and route-specific review restrictions remain intact. Grouping is for presentation and does not establish that nearby records are one physical platform. See [unified stations](docs/unified-stations-2026-11-14.md).

The current dataset is labeled `operator_published`, separately from the field/manual verification gates used by legacy data. Stops are ordered by projection along the published track while preserving source indices; actual operating directions remain unconfirmed. Routes 6/7/8 have an approach segment and a near-loop shape; this does not justify adding a closing edge or assuming continuous loop operation. The approximately 83-meter offset at Route 3B's Gate 2 stays at its source coordinate and is excluded from automatic boarding, alighting and transfers on that line; Route 3's valid visit remains usable. This is not evidence that service has stopped. See [direction and closure review](docs/direction-closure-check-2026-11-13.md). Private source material stays local; published navigation data excludes credentials, internal source IDs, personal records and local machine paths while retaining necessary public campus coordinates.

The planner supports fuzzy campus search, map selection, optional location and automatic boarding/alighting recommendations. The origin defaults to the current location; location is requested after confirming a destination, and no route is preselected. A failed location request does not silently select the first stop. The glass-style sheet supports peek, half and full positions and dragging, with results on the same map. Old index links redirect to this entry. See [the unified home and map legend](docs/unified-home-2026-11-13.md). Campus search combines OpenStreetMap places with user-supplied building aliases and service descriptions, recommends nearby stops, and offers WeChat's native Tencent location picker. See [campus address search and source boundaries](docs/campus-place-search-2026-11-13.md).

### Historical data and services

The 2025 campus illustration, old Routes 1–9, review gates, experimental Tencent segments and historical navigation services remain in the data/service layers for provenance and research. They are not a second current planner in the user interface. The early 2026 operator name catalog remains in `operator-routes.json`; the current entry uses independent `current-transit` data and does not connect roads from historical stop order. Route 9 being absent from that catalog does not establish a service withdrawal. See [operator observations](docs/operator-route-observations-2026-11-13.md) and the maintenance documentation below.

Location is requested only after a user action. The map's location control updates the map position without changing trip endpoints. Initial entry preserves the campus view, and stale location callbacks cannot override a newer route or overview selection. No live vehicles or arrival predictions are currently provided.

<a id="quick-start"></a>
## Running the project

1. Install [WeChat DevTools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html).
2. Clone this repository and import its root directory into DevTools.
3. Use guest mode without a Mini Program AppID; for formal debugging, configure your own AppID in project settings.
4. Run `npm install` to install development dependencies.
5. Run `npm run typecheck`, `npm run validate:data`, and `npm test` for TypeScript checks, static-data validation, and all tests.

Before real-device testing, declare location and selected-location usage in the Mini Program User Privacy Protection Guidelines and enable the required location-picker interface in the WeChat public platform. The Mini Program requests consent before protected APIs. DevTools simulations do not establish backend approval or replace real-device GPS and permission-denial tests.

The basic `map` component needs no Tencent Location Service key. For Tencent geocoding/walking routes, copy `miniprogram/config/config.example.ts` to Git-ignored `config.local.ts`, supply your WebService key, and configure the Mini Program request source and `https://apis.map.qq.com` allowed domain in Tencent's console. Never commit real keys.

<a id="development"></a>
## Development documentation

Expand the sections as needed. Supporting documents may still be in Chinese; this README translation does not localize the Mini Program UI.

<details>
<summary><strong>Directories, data models, location, and route recommendations</strong></summary>

## Planned directories

```text
miniprogram/
├── pages/                 # Presentation and user interaction only
├── components/            # Reusable UI components, created as needed
├── config/                # Templates; local keys stay out of Git
├── data/                  # WeChat TypeScript Data Adapters and offline JSON mirrors
├── models/                # Stable TypeScript domain models
├── services/
│   ├── location/          # WeChat location
│   ├── map/               # Tencent map and routing adapters
│   ├── navigation/        # Boarding/alighting selection and routing
│   ├── repository/        # TypeScript Data Adapter / CloudBase boundary
│   ├── validation/        # Reusable route-data quality rules
│   └── vehicle/           # Pluggable real-time vehicle Provider
└── utils/                 # Stateless utilities such as distance calculations
```

Directories are created when needed rather than generating empty files up front. Pages do not implement routing or data access, easing a later switch from static Data Adapters to CloudBase.

## Core data models

The sections below describe retained legacy services and maintenance workflows. Current published-data models are in `miniprogram/models/current-transit.ts`; see the current navigation documents linked above for their separate data and quality boundaries.

Defined in `miniprogram/models/index.ts`:

- `BusStop`: stop name, aliases, and coordinates.
- `BusStopCoordinate`: GCJ-02 stop coordinates with `verified` status.
- `VerifiedBusStop`: Repository-verified stops suitable for the map.
- `BusDirection`: a direction, known ordered stop IDs, and optional manually confirmed GCJ-02 geometry.
- `BusRoute`: one or more directions, service type, stopping policy, and data confidence status.
- `RouteGeometry`: vendor-independent route ID, direction ID, and GCJ-02 points.
- `RouteGeometryCacheEntry`: development API cache containing travel mode, endpoints, and returned points.
- `RouteNavigation`: direction, known reference stops, geometry, service type, and waiting guidance.
- `RouteNavigationViewModel`: page-ready single-route/direction data, known stops, verified geometry, and stopping guidance.
- `CampusPOI`: searchable place, category, associated stops, and data status, without inferred coordinates.
- `RouteRecommendation`: candidates derived from place associations, matching stops, available directions, service types, and data status.
- `RoutePathRecommendation`: direct routes confirmed by origin/destination stop order, boarding/alighting stops, directions, service types, status, and guidance.
- `NearestStopResult`: distance from the user to a verified stop, plus ID, name, and coordinates.
- `CandidateCoordinate`: external-map coordinates requiring manual review, always unverified.
- `CoordinateReview`: candidate review status for a target stop, source, and review time.
- `WalkingRouteResult`: vendor-independent walking route in meters, seconds, and GCJ-02 polyline.
- `Coordinate` and `Location`: common GCJ-02 coordinates and location results with accuracy.
- `VehicleLocationProvider`: pluggable boundary for future authorized live vehicle data.

`BusDirection.isLoop` identifies loops. Ordinary repeated stop IDs are rejected; a loop may repeat its start once at the end. Routes 6 and 9 revisit Gate 2 in the map, declared through `allowedRepeatedStopIds`. `BusStop.coordinate` is `null` until collected. Entered but unconfirmed coordinates use `verified: false`; only `verified: true` reaches the map. All coordinates use WeChat's GCJ-02 system.

Campus buses differ from standard city buses. `BusRoute.serviceType` supports `fixed_stop` and `flexible_campus_bus`; `allowIntermediateStop` states whether en-route stops are permitted. `dataStatus` uses `needs_review`/`verified` for manual review of service behavior, direction, and stop order. `stopIds` represents currently known stops: each fixed-stop direction needs at least one; flexible buses may temporarily use an empty array for an uncollected full stop set. Entered stops must exist in `stops.json`.

## MVP development order

Run, check, and accept each step before proceeding:

1. Display the campus map (complete).
2. Obtain/display user location (complete).
3. Establish static Route 1 stops/routes (complete).
4. Coordinate validation, marker pipeline, route-details UI (code complete; field coordinates pending).
5. First Routes 1–9 dataset and loop validation (complete).
6. Local/CI route-data quality validation (complete).
7. Automated CI gates and global integrity rules (complete).
8. Campus POI model, aliases, route associations (complete).
9. Single-route direct recommendations and flexible-stopping guidance (complete).
10. Direct origin–destination route/direction matching (complete).
11. Coordinate/distance calculations and nearest verified-stop queries (complete).
12. Map Provider abstraction, Tencent adaptation, candidate coordinates (complete).
13. Manual candidate review/filtering/runtime application (complete).
14. Navigation around directions, known stops, optional geometry (complete).
15. Offline geometry pipeline using verified stops/API caches (complete).
16. Route lists, direction switching, stop sequences, map geometry (complete).
17. Route 1 missing-data checks, geometry review, production gates (complete; field coordinates/real geometry pending).
18. Review routes, POI relationships, coordinates, and geometry against 2026 signs, notices, and rides.
19. Integrate walking routes before boarding and after alighting.
20. Add route ranking, timetables, alternatives.
21. Move mutable data to CloudBase when stable.
22. Add live vehicles only after obtaining an officially authorized API.

## Location-service design

`miniprogram/services/location/location.service.ts` encapsulates WeChat location APIs. Pages call only `getCurrentLocation()` and display status. `LocationPlatformApi` isolates platform objects, allowing Node.js fakes to test permissions, accuracy, and error classification.

## Bus-data design

- `miniprogram/data/stops.ts`: deduplicated runtime stops.
- `miniprogram/data/routes.ts`: ordered directional stops expressed only as IDs.
- `miniprogram/data/sources.json`: sources, allowed uses, pending review.
- `miniprogram/data/coordinate-reviews.ts`: separate runtime candidates/manual reviews; no official-stop overwrite.
- `miniprogram/data/route-geometries.ts`: separate runtime directional geometry; no stop-order changes.
- Same-named JSON files are offline sources; `npm run sync:data` generates TS Adapters. CI/consistency tests prevent missed synchronization.
- `miniprogram/data/geometry-cache.json` is read only by Node.js scripts, reducing repeated API use; not part of Mini Program runtime.
- Repositories read/validate TS Adapters. Pages/Services must not directly import static data.
- `getVerifiedStops()` returns only complete coordinates explicitly marked `verified: true`.
- Route Catalog joins routes/stops, checks duplicate/undefined stop IDs in every direction, and passes only verified stops to the map.
- Future CloudBase migration can replace Repositories without changing pages/domain models.

The first Routes 1–9 dataset is not claimed as official live 2026 data. On 2026-09-22 the user confirmed “中图” means Central Library; zhongtu is retained and linked to the library POI. Actual waiting positions and operating directions need field checks. No unauthorized live bus API is used.

Service-policy format:

```json
{
  "id": "route_1",
  "name": "1路",
  "serviceType": "flexible_campus_bus",
  "allowIntermediateStop": true,
  "dataStatus": "needs_review",
  "directions": []
}
```

Routes 1–9 retain known stop order and use `flexible_campus_bus` based on en-route stopping behavior. This remains `needs_review`, not completed 2026 operational verification.

## Campus POI knowledge layer

`miniprogram/data/pois.ts` stores a few high-value runtime places: stable ID, name, aliases, category, associated stop IDs, and status. No GPS coordinates or image-inferred positions are included. The first edition has the library, student dormitories, Second Canteen, Gate 1, and Gate 5. Uncertain associations use empty `relatedStopIds` and `needs_review`.

```text
Place name or alias
  → PoiRepository
  → CampusPOI.relatedStopIds
  → PoiRouteService
  → Route Catalog
  → Routes containing associated stops
```

Second Canteen associates with its same-named stop to find Route 4. Central Library associates with user-confirmed zhongtu to find Route 9; “中图”, “图书馆”, and “西大图书馆” are aliases. POI coordinates, real walking distances, and boarding/alighting positions still need field checks.

## Single-route direct recommendations

`RouteRecommendationService` offers `recommendRoutesForPoi(poiId)` and `searchAndRecommend(keyword)`. It composes the POI Repository, association service, and Route Catalog only; no direct JSON reads or page-specific structures.

```text
Destination keyword
  → PoiRepository.search()
  → CampusPOI.relatedStopIds
  → Routes in Route Catalog containing associated stops
  → RouteRecommendation (matched stops, directions, service type, status)
```

Searching “第二食堂” matches Second Canteen and recommends Route 4 with matching directions. `flexible_campus_bus` adds guidance to confirm boarding locations on site. POIs without associated stops return empty recommendations, not errors or guessed routes; unknown POI IDs return explicit errors.

Recommendations do not calculate distances/walking routes, identify nearest stops, or indicate live vehicle availability.

## Origin–destination route matching

`OriginDestinationService.findDirectRoutes(originPoiId, destinationPoiId)` queries Repositories/Route Catalog, not JSON directly.

```text
Origin CampusPOI.relatedStopIds ─────┐
                                    ├→ Check ordered stopIds per route/direction
Destination CampusPOI.relatedStopIds ┘
                                       → RoutePathRecommendation[]
```

A direction qualifies only when an origin-associated stop precedes a destination-associated stop. Multiple valid directions of one route combine into one domain result, retaining matched boarding/alighting IDs. Unknown endpoint POIs return explicit errors. No associated stops or common direct route yields an empty array.

Flexible buses advise confirming boarding/alighting on site, not guaranteed stopping. Only static connectivity is calculated, not GPS/walking distance or nearest stops; results do not represent live vehicles. One-transfer search follows.
</details>

<details>
<summary><strong>Experimental preview, offline generation, and one-transfer search</strong></summary>

## Colored network preview and one-transfer search

The map offers “路网总览 / 腾讯参考” (network overview / Tencent reference) switches and “看全线” (view full route). Routes 1–9 retain the 2025 image's colors. Clicking a route number, direction button, or navigation result turns overview off/reference on, shows **only that route's current direction**, and fits the view. User-location markers are unaffected. Direction controls stay visible; expandable details show stop order and missing segments. Other routes' first directions appear together only when overview is manually enabled.

Startup shows only verified official geometry. Selecting a route or explicitly enabling Tencent reference displays offline Tencent driving recommendations as **dashed lines**. Route, direction, and generated/expected segment counts below the map prevent incomplete geometry from appearing complete.

**Experimental segments are not confirmed campus bus paths and cannot confirm waiting positions.** The image supports stop-order/color checks only; it has no geographic registration baseline, cannot guarantee Tencent basemap alignment, and is not used to infer GPS from pixels. Segments adjacent to missing/suspicious coordinates stay blank; straight lines are not inserted. Official coordinates stay unchanged. Unreviewed candidates never enter markers, nearest-stop calculations, or official geometry Repositories.

Development commands (all nine routes by default; up to 80 requests, hard limit 120):

```bash
npm run generate:preview -- --max-requests=80
# Selected routes only; replaces experimental data, not official data
npm run generate:preview -- route_1 --max-requests=30
# Inspect Tencent place titles only; do not change map previews
npm run generate:preview -- --inspect-places --max-requests=30
# Replay complete caches with zero network requests
npm run generate:preview -- --max-requests=0
npm run check:data-sync
npm run validate:data
```

Keys remain in ignored `config.local.ts`. Generation uses Tencent Beibei place search, requiring SWU context and a unique exact normalized stop-name match; place titles remain source evidence. No unique match means a gap, not fallback to the first fuzzy geocoding result. Place searches/directional driving segments use `.cache/route-preview-cache.json`, preferring cache hits. Requests are throttled, timed out, and capped; keys, URLs, and raw external errors are not logged. Network/API/quota failures preserve the previous preview. Separate `route-preview.json / .ts` outputs contain candidates, segments, generation time, warnings, always `verified:false / needs_review`. Candidate confidence reflects name matching, not actual stop-location reliability. Runtime reads TS Adapters through Repositories, without Tencent routing requests.

On 2026-09-25, recollection using place-title evidence made 22 place searches and 40 driving requests, finding 16 unique candidates and **94/118 directional segment records**. Shared segments are referenced by different routes, not 94 distinct roads. Earlier geocoding deviations for Gate 6, Teaching Building 26, and the School of Foreign Languages were corrected. 圆顶, 西师街, 二食堂, and 大礼堂 still lack reliable matches, so adjacent segments are not generated. Routes 3/6/8 have complete reference-segment counts, but all routes need real-ride verification. See the [image/Tencent comparison](docs/tencent-route-comparison-2026-09-25.md); the [September 22 record](docs/route-preview-trial-2026-09-22.md) is historical.

After selecting endpoints, navigation shows direct routes first, then up to six one-transfer candidates. Transfers occur only at the **same stopId**, between different routes, with valid nonzero-length directions on both legs. Explicitly closed loops allow at most one circuit. Results rank by reference stop-sequence segment count and stable ID, not shortest distance, fastest travel, or safe-transfer guarantees. Second Canteen → Central Library can use Route 4 then Route 9; each leg opens its own direction/map. Same-side boarding, actual stopping, and safe road crossing need field confirmation. No walking connectors, two-or-more transfers, live vehicles, or timetables are provided.
</details>

<details>
<summary><strong>Map adapters, coordinate review, and real-geometry validation</strong></summary>

## Spatial foundation

`Coordinate` represents WeChat GCJ-02 latitude/longitude without WGS84 conversion. `distanceBetween(a, b)` is a stateless pure function using mean Earth radius and Haversine to calculate spherical distance in meters.

`NearestStopService.getNearestStops(origin)` obtains candidates only through `BusStopRepository.getVerifiedStops()`, computes/sorts distances nearest-first, and returns `NearestStopResult[]`. Stops with `null` coordinates or `verified: false` are excluded; no verified stops yields an empty array.

Official data still lacks complete stop coordinates. Coordinates are never generated for demos or inferred from campus maps. This is spatial calculation only, not road/walking distance, pedestrian reachability, or walking navigation.

## Map-service adapters

`MapProvider` is a vendor-independent boundary for geocoding, reverse geocoding, walking, and driving routes. `geocode()` returns one or more candidates on success or an empty array for no results. Business/offline-generation services depend only on this interface, allowing Tencent, Amap, or test implementations without changing POIs, bus recommendations, or OD matching.

```text
GeocodingService / WalkingRouteService
                  ↓
              MapProvider
                  ↓
 TencentMapProvider / MockProvider / future provider
```

`TencentMapProvider` is the sole Tencent Location Service WebService integration point, encapsulating `wx.request`, response parsing, walking-duration conversion, and compressed-polyline decoding. Endpoints:

- `/ws/geocoder/v1/`: geocoding/reverse geocoding.
- `/ws/place/v1/search`: development scripts only, candidates with name evidence; does not replace campus POIs.
- `/ws/direction/v1/walking/`: walking routes.
- `/ws/direction/v1/driving/`: development scripts only, offline candidate bus geometry.

Geocoding produces only `CandidateCoordinate`, always `verified: false`. Manual confirmation and separate maintenance are required before conversion to official `BusStop.coordinate`. The service neither writes Repositories nor edits `stops.json` automatically. Tencent supplies geographic capabilities, not bus routes, associations, or recommendation decisions.

Single-address development query:

```bash
npm run geocode "西南大学北碚校区图书馆"
```

The script reads Git-ignored `miniprogram/config/config.local.ts`, makes a real request through `TencentMapProvider`, and prints only unverified candidates. It writes no JSON, overwrites no coordinates, and never automatically verifies candidates. API errors produce nonzero exit codes; no results normally produce an empty array.

## Manual coordinate review

External-map results follow a separate flow:

```text
CandidateCoordinate
  → pending_review
  → verified / rejected
```

List coordinates awaiting confirmation:

```bash
npm run review:coordinates
```

Runtime records come from `miniprogram/data/coordinate-reviews.ts`; `coordinate-reviews.json` remains the offline mirror. `pending_review` requires `reviewedAt: null`. Only manual checks permit `verified`/`rejected`, with timestamps. Candidates themselves remain `verified: false`; at runtime the review service converts only `status: verified` records into verified coordinates for maps/nearest-stop services.

`ReviewedBusStopRepository` is a read-only decorator: it does not write/overwrite `stops.json` or override existing official coordinates, and filters pending/rejected candidates. The Tencent library coordinate remains a `pending_review` example: no marker or nearest-stop participation.

## Route navigation

The top bar offers “校园地图 / 线路导航” (campus map / route navigation). Select known campus places/reference stops: without origin, query routes serving the destination; with origin, OD Service matches direct routes/directions. Results show boarding/alighting references, stop order, flexible-stopping guidance. “查看此方向与地图” selects that route/direction. Missing associations, no direct route, or identical endpoints produce clear explanations; changing places clears old results.

Example: “中心图书馆” (Central Library) finds both illustrated Route 9 directions. Origin “五号门” (Gate 5) prioritizes the shorter “图示顺序”: Gate 5 → 橘园 → 梅园 → Central Library; the reverse loop may also match. This is reference-stop-order navigation, not geometry-based turn-by-turn navigation.

Tencent geocoding/reverse geocoding were tested on 2026-09-22; the [coordinate record](docs/coordinate-check-2026-09-22.md) retains results/uncertainties. Recheck using `npm run geocode "重庆市北碚区西南大学中心图书馆" -- --verify`; no data is written or candidate automatically approved. Address similarity cannot replace stop-location review.

`RouteNavigationService` provides route lists, direction options, and `getRouteNavigation(routeId, directionId)`. Queries return `RouteNavigationViewModel`: route name, direction, service type, known references, verified geometry, and waiting guidance only. Missing geometry does not block queries; known stop order remains, explicitly marked as awaiting manual geometry collection.

```text
RouteRepository / Route Catalog
              ↓
   RouteNavigationService
              ↓
RouteNavigationViewModel
              ↓
Page → marker / RoutePolylineService → WeChat map
```

`RoutePolylineService` converts vendor-independent `RouteGeometry` to WeChat `points`, `color`, and `width`; no added points, inferred geometry, or coordinate conversion. Geometry requires manually collected/checked GCJ-02 coordinates. Official Routes 1–9 currently have no geometry, so no guessed lines are drawn.

For `allowIntermediateStop: true`, navigation advises safe waiting positions based on actual conditions. Known stops are operating references, not a claim that boarding/alighting is limited to fixed stops.

Pages get Routes 1–9 through Services. Direction buttons show names and first/last known stops. Route/direction changes refresh stop order, verified markers/polylines together. Independent location service state is not cleared.

Presentation based on the 2025 map:

- Always-visible Routes 1–9 selectors retain original colors; verified geometry uses route colors.
- Routes 1–5 are bidirectional; 6–9 loops. Loop summaries show the first three reference stops and return stop.
- Intermediate revisits/closure are preserved, labeled “再次经过” (passes again) and “返回起点” (returns to start); one marker per stop.
- Details scroll together: reference order, flexible-stopping guidance, pending coordinate/geometry status, and data year.
- `RouteMapPresentationService` generates states, colors, markers, geometry centrally; pages do not compose domain data or read static files.

A second image check on 2026-09-22 found no differences in entered Routes 1–9 order; Route 4's second stop remains “二食堂”. The user subsequently confirmed Route 9's “中图” as Central Library, and associations were synchronized. No coordinates/campus outline were inferred or 2025 operating hours reused as today's timetable.

DevTools/device acceptance: check initial campus view; switch campus/urban views, pan, return to campus; simulate a remote location without camera jumps. Scroll Routes 1–9, checking only the selected current-direction dashed line/color remains and view fits. Switching direction, selecting from overview, or opening navigation results must clear other routes. Check Route 6/9 summaries/repeated-stop labels especially. Expand missing-segment details. Disabling Tencent reference leaves no route lines because verified geometry is absent; this is expected.

No nearest boarding point, walking distance, ETA, or live vehicles are computed; illustrated routes are not guaranteed identical to today's operations.

## Offline geometry generation

`RouteGeometryGeneratorService` reads verified GCJ-02 coordinates through `BusStopRepository.getVerifiedStops()` following `stopIds`, then calls `MapProvider.drivingRoute()` per segment. Polylines merge in stop order, removing adjacent duplicate points. Missing verified coordinates stop generation; no candidate/image gap filling.

```text
BusDirection.stopIds
        ↓
VerifiedBusStop coordinates
        ↓
geometry-cache.json (cache first)
        ↓ miss
MapProvider.drivingRoute()
        ↓
Merge segments/remove adjacent duplicates
        ↓
Generator result (generated)
        ↓ review queue
route-geometries.json (needs_review)
        ↓ manual approve
verified → RouteNavigation → map polyline
```

```bash
npm run generate:geometry route_1
```

Preflight checks every target-direction stop for verified coordinates. Missing items output `missing coordinate` without reading keys, creating Providers, or requesting Tencent. Only successful preflight permits `TencentMapProvider` to call `/ws/direction/v1/driving/`. Results are `generated`, becoming `needs_review` in the separate review file; manual source/direction/geometry checks precede `verified`. Neither `routes.json` nor `stops.json` is modified.

Cache keys comprise mode and endpoint latitude/longitude; opposite directions use different entries. Successfully fetched segments are cached even if later segments fail, avoiding repeated quota use.

`RouteGeometryRepository` offers ordinary/verified queries; runtime navigation calls only `getVerifiedGeometry()`. Pages never construct `TencentMapProvider`; viewing/switching/querying routes makes no live Tencent routing requests. Insufficient official coordinates leave geometry files empty, not fabricated for demos.

## Route 1 demo review loop

Inspect both directions, endpoints, geometry status, point counts, and missing coordinates:

```bash
npm run review:geometry
```

Current results: forward “经管院 → 五号门”, reverse “五号门 → 经管院”; both `missing`, zero points. Verified coordinates are missing for `jingguanyuan`, `gate_6`, `gate_2`, `building_8`, `tianjiabing`, `yuanding`, `gate_5`. This gap is not filled with image/Tencent candidates.

After generation, manually review with explicit direction names:

```bash
npm run review:geometry route_1 approve "图示正向"
npm run review:geometry route_1 reject "图示正向"
```

`approve` changes an existing `generated`/`needs_review` candidate to `verified`; `reject` removes it. Neither changes `routes.json`. Production reads only `verified`; development tests may explicitly inspect unreviewed geometry through `previewUnverifiedGeometry`.
</details>

<a id="data-maintenance"></a>
## Data maintenance and validation

After editing `stops.json`, `routes.json`, `pois.json`, `coordinate-reviews.json`, or `route-geometries.json`, run:

```bash
npm run sync:data
npm run check:data-sync
```

JSON is the offline edit entry; generated same-named `.ts` files are WeChat runtime Data Adapters. Commit both. Synchronization only copies data, never generating coordinates or changing review states. All JSON is parsed before Adapters update. Synchronization does not replace domain validation; run checks/tests below. Geometry generation/review share this logic and automatically synchronize both file types.

`check:data-sync` is read-only, exiting 1 for missing/outdated Adapters. Runtime remains `Page → Service → Repository → Data Adapter`. Startup tests allow only TypeScript-compiled JS modules, check homepage dependencies and Routes 1–9 direction queries, and reject JSON, Node modules, and local-key dependencies. They do not replace DevTools/device map/location acceptance.

After adding/changing routes, stops, directions, or sources:

```bash
npm run validate:data
```

The command reports route, POI, coordinate-review, and geometry checks individually. Exit `0` means all pass; `1` means errors, usable in CI. Every geometry must reference an existing route/direction and contain at least two valid points; verified geometry requires a source. Stop/geometry latitude and longitude ranges are `-90–90` and `-180–180`, respectively.

Register sources/review status in `sources.json` before entering names/order from original materials. Images support only clearly evidenced information, never coordinate inference. Keep `needs_review` until checks against that year's official notices, signs, and rides are complete. Before committing, run `npm run validate:data`, `npm run typecheck`, and `npm test`, in order.

<a id="ci"></a>
## Continuous integration

GitHub Actions at `.github/workflows/ci.yml` uses Node.js 24 LTS on pushes/pull requests targeting `main`:

```bash
npm ci
npm run check:data-sync
npm run validate:data
npm run typecheck
npm run test:coverage
```

`test:coverage` runs tests through c8 and generates coverage; OIDC uploads `coverage/lcov.info` to Codecov. Upload failures do not fail CI (`fail_ci_if_error: false`).

Installation, validation, type-check, or test failures fail the workflow. Changes to `routes.ts`, `stops.ts`, corresponding JSON, `sources.json`, or other TypeScript must pass local validation and CI before data changes merge.

<a id="safety"></a>
## Safety and data principles

- Never commit AppSecrets, map keys, tokens, cookies, or user identity data.
- Do not call or reverse-engineer unauthorized private campus-bus APIs.
- Route/stop data must identify sources and be checked against on-campus evidence.
- Live vehicles are not required for the MVP.

## License

[MIT](LICENSE)

[Back to top](#top)
