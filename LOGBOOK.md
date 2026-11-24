# HugeGraph Portal — Logbook

This file records user requests, clarifications, implementation updates, and verification. Append a dated entry for each subsequent user update; preserve earlier entries. Times use Asia/Kuala_Lumpur where specified.

## 2026-11-05 — Initial request

**Requested by user:** Build a web portal for Apache HugeGraph data already created locally through Hubble and Docker.

- Starting page: searchable four-by-four card grid of graphs, plus a graph-creation button.
- Dashboard: interactive vertices/edges canvas, hover properties, adjacent property search, and relationship exploration.
- Workspace pages: all vertices, and edges with source and target.
- Design: retro and playful; HugeGraph-inspired purple, white, blue, black, and light green.
- Stack: HTML/CSS/JavaScript/React frontend, Node.js/Express backend, Apache HugeGraph database.
- Documentation: README.md explaining technology, flow, and implementation; LOGBOOK.md recording updates.
- Ask first when a feasibility clarification is needed.

## 2026-11-05 — User clarifications

1. HugeGraph has **no credentials** and uses the Docker image described as **latest**. The exact image version/digest remains unverified.
2. **Build locally, but leave graph creation disabled.** This overrides the initial request for active graph creation.
3. Supplied server URL: **http://127.0.0.1:8088/**.

**Applied:** Created a local, ignored `.env` with the supplied URL, no credentials, automatic API detection, and `HUGEGRAPH_ALLOW_CREATE=false`. Both API and UI enforce the creation setting. The plus button remains visible and explains why creation is disabled.

## 2026-11-05 — Initial implementation

- Created a React/Vite frontend and Express backend in the previously empty project directory.
- Implemented graph cards with graph-name search, alphabetical sorting, refresh, and 16-item pagination. Desktop uses four columns; smaller screens adapt to two.
- Added hash navigation and graph-specific Dashboard, Vertices, and Edges pages.
- Added a Cytoscape canvas with directed edge labels, draggable vertices, zoom, fit, rearrangement, hover properties, click inspection, and highlighted neighborhoods.
- Added server-backed property/label/value searches, optional exact matching, scan metadata, search results, and neighborhood loading including endpoint vertices outside the initial view.
- Added separate vertex and edge tables using HugeGraph cursor pagination, current-page filters, expandable properties, source/target IDs, and refresh.
- Added a clearly labeled opt-in Demo mode. Live errors never silently fall back to sample data; demo fixtures never enter HugeGraph.
- Added local connection guidance, empty/error/loading states, native accessible dialogs, responsive navigation, keyboard focus indicators, and reduced-motion support.
- Implemented current graph-space and legacy REST adapters, per-request timeouts, bounded snapshots/searches, explicit truncation warnings, typed vertex IDs, and repeated-cursor protection.
- Included an opt-in graph-creation adapter for future configuration; **disabled by default and in the supplied environment**. No data deletion or update endpoints were introduced.
- Added npm development/build/start/test scripts, pinned dependencies and a lockfile, ignored build output/secrets, and a project favicon.
- Documented architecture, usage, API endpoints, configuration, data bounds, version caveats, and troubleshooting in README.md.

## 2026-11-05 — Validation and environment limits

- Installed dependencies from the machine's npm cache because external package downloads are unavailable. Pinned compatible cached Rollup/esbuild/PostCSS versions through npm overrides.
- Production frontend build: passed.
- Backend adapter tests: **12 passed**, using mocked HTTP responses; no live graph changes.
- Docker inspection: access to the Docker socket was denied by the environment.
- Supplied HugeGraph endpoint: unreachable from this execution session.
- Local runtime preview: socket binding is blocked (`EPERM`). Chromium preview is also blocked by system-call restrictions. Live integration and browser interaction checks could not be completed here.
- The project is prepared for host-local startup with `npm run dev` or `npm run build` followed by `npm start`. The remaining manual check is to open it on the machine where HugeGraph runs and verify the existing graph data.

## 2026-11-05 — Graph creation clarification

**User question:** What is graph creation for?

**Explanation:** It creates a separate graph database with its own schema, vertices, and edges. It is not needed to view existing graphs or add data through Hubble. Creation remains disabled.

## 2026-11-05 — Recheck missing graphs / unrecognized graph-list response

**User report:** The graph library shows zero graphs and “Unexpected HugeGraph graph-list response. Check the API mode.”

**Findings:** The supplied configuration used port 8088. Apache's documented default is 8088 for the Hubble web interface and 8080 for HugeGraph Server. This makes a Hubble/Server port mismatch the likely cause; the actual Docker port mapping remains unverified because this session cannot access Docker or host-local services. The adapter also accepted successful HTML or unrelated JSON as API detection success and cached that route prematurely.

**Changes:**

- Updated `.env` and `.env.example` to the standard Server API URL, `http://127.0.0.1:8080`. This is a documented-default correction pending host-side confirmation, not a verified discovery of the user's Docker mapping.
- Validate JSON graph-list content before caching an API mode. A successful catch-all response no longer prevents checking the legacy endpoint.
- Detect HTML and malformed graph responses, with an actionable explanation distinguishing Hubble from HugeGraph Server. Authentication failures still propagate without fallback.
- Updated the in-app connection guide and README with correct default ports, custom Docker mapping examples, and restart instructions.
- Kept graph creation disabled; no graph data was changed.

**Validation:** Added four regression tests for Hubble HTML, a successful catch-all route with a valid legacy API, unrelated scoped JSON, and empty/malformed graph lists. All **16 tests passed**; production build passed. Requested host-side `curl -i http://127.0.0.1:8080/graphs` output to confirm the actual graph list. Live verification remains pending.

**Host-side confirmation from user:** `GET http://127.0.0.1:8080/graphs` returned HTTP 200, `Content-Type: application/json;charset=UTF-8`, and `{"graphs":["example_01","hugegraph","mydatabase","school_database"]}`. This confirms port 8080 is the Server graph-list endpoint and all four graphs exist. The corrected `.env` points to that confirmed address. Restarting the portal is required to load the environment change; dashboard/vertex/edge access has not yet been checked against the live server.

## 2026-11-05 — Increase all font sizes by 10%

**User request:** Increase the size of every font by 10%.

**Implementation:** Increased all explicit pixel font sizes across desktop and responsive styles by a factor of 1.1. Set the root font size to 17.6px (previously the browser default of 16px) so inherited text also grows by 10%. Relative font sizes retain their existing ratios to the enlarged parent. Increased Cytoscape vertex and edge label sizes by 10% too. Layout dimensions and responsive breakpoints are unchanged.

**Validation:** Production build passed. Browser layout verification remains unavailable in this session.

## 2026-11-05 — Enable graph creation and search node relationships

**User request:** Add graph creation and replace the right-hand vertex search with a node lookup showing connected nodes and their relationships.

**Implementation:**

- Enabled `HUGEGRAPH_ALLOW_CREATE=true` in the local and example environment files. Updated the creation modal with duplicate-name feedback, storage-template selection, pending-request protection, verified success navigation, and an explicit check-the-list action for uncertain outcomes.
- Validate graph/template input types and source backend before creating. Support existing RocksDB and memory templates, with a separate store and unique RocksDB data/WAL directory. Resolve graph management using read-only template details independently of graph-list API detection, supporting both legacy text and scoped JSON. Block concurrent submissions for the same name and never automatically retry a POST. Surface permissions, unsupported APIs/backends, and uncertain creation results.
- Replaced the property/label form with an all-node-type name, ID, label, or property-value search. A single complete match opens its neighborhood automatically; ambiguous results let the user select a node. Canvas node clicks use the same connection-loading flow.
- Added a Connected nodes panel displaying source → relationship → target, incoming/outgoing/self direction, distinct neighboring-node counts, relationship IDs and properties, node properties, and follow-node actions. Direction filters work in Live and Demo. Preserve typed IDs, parallel relationships, self-links, and isolated nodes. State guards prevent stale connection loads or search auto-selection from replacing newer selections.
- Updated empty-state guidance, responsive styling, API documentation, setup instructions, and configuration notes. Existing branding remains unchanged.

**Validation:** All 28 automated tests passed. The production frontend build passed. Tests use mocked HugeGraph responses and local graph fixtures; no live graph was created during validation. The configured `127.0.0.1:8080` server was unreachable from this session, and a local HTTP startup check failed with `EPERM`, so live integration and browser interaction remain unverified here. Restart the portal backend to load the new environment setting, then use Live → New graph. Your installed HugeGraph version and permissions must support dynamic graph creation.

## 2026-11-07 — Code cleanup and bug fixes

**User request:** Clean the code and fix bugs.

**Implementation:**

- Extracted the data table, pagination, and shared feedback components from `App.jsx`. The table now keeps page controls available on empty pages with cursors and preserves original row numbers when filtering.
- Handle upstream failures during response-body reads, including timeout aborts, as connection errors. Reject malformed page payloads, non-string cursors, and pages exceeding the requested limit. Property-specific search ignores inherited object properties.
- Validate browser API responses and require a matching graph name before reporting creation success. Invalid or interrupted creation responses retain the check-the-graph-list workflow, without retrying the write. Keep the selected storage template valid when graph lists load or change.
- Preserve numeric/string edge IDs separately on the canvas and clear stale tooltips when graph data changes. Derive demo relationship counts from their actual snapshots.
- Added regression coverage for API response handling, creation confirmation, interrupted bodies, timeouts, malformed pages, empty-page continuation, inherited properties, and demo counts.

**Validation:** All **39 tests passed** and `npm run build` passed. Tests use mocked responses and local fixtures. Browser interaction and live HugeGraph integration were not verified in this cleanup; no database mutation was performed.

## 2026-11-07 — Response validation and component cleanup

**User request:** Clean the code and fix any bugs.

**Implementation:**

- Extracted node search and the connection inspector into separate components. Shared property rendering across the inspector, table rows, and canvas tooltips.
- Reject malformed upstream vertices and edges before they reach the UI, including missing labels, invalid properties, unsafe numeric IDs, and missing edge endpoints. Verify that each neighborhood vertex response matches the requested ID and its type. Reject empty graph names.
- Centralized scalar query validation for search, pagination, and directions. Repeated parameters, invalid exact-match values, and empty directions now return HTTP 400. Keep API errors uncached even when JSON parsing fails.
- Preserve custom browser request headers for objects, Headers instances, and entry arrays, including case-insensitive Content-Type overrides.
- Validate URL configuration at startup to prevent query strings, fragments, or embedded credentials from breaking upstream paths. Normalize trailing slashes and document the supported configuration.

**Validation:** All **48 tests passed** and `npm run build` passed. Added nine tests covering request headers, Express middleware/routes, malformed graph records, endpoint ID verification, and URL configuration. Route tests run without listening on a port. Tests use local fixtures and mocked upstream responses; live HugeGraph and browser interaction remain unverified. No database mutation was performed.

## 2026-11-12 — Separate graph vertices and relationship labels

**User request:** Adjust vertex and edge positions to reduce the overlaps shown in the supplied screenshot, and explain the changes step by step.

**Implementation:**

- Moved layout settings into `src/graphLayout.js`, shared by first load and Rearrange. Enabled label-aware dimensions, increased repulsion and preferred edge length, reduced gravity, and added more spacing between disconnected components.
- Added a final geometry pass that measures each node's body and label and expands positions only as needed to leave 16 model units of clearance between their bounding boxes. Fit the completed result with 70 pixels of padding.
- Wrapped long node names, offset relationship text from edge lines, made label backgrounds opaque, increased spacing between parallel edge curves, and made edge endpoints respect node labels. Dense graphs can still contain crossing edges and overlapping relationship labels; dragging can also reintroduce overlaps.
- Documented the exact layout sequence in README.md.

**Validation:** All **52 tests passed** and the production build passed. Four added tests cover label-bound separation, coincident positions, empty/single-node inputs, preserving already-spaced positions, and repeated headless layouts across all demo graphs. Browser verification remains unavailable: Chromium exits with `setsockopt: Operation not permitted`. Label-bound tests use simulated measured rectangles; headless Cytoscape does not measure browser-rendered text. No database mutation was performed.

## 2026-11-12 — Fix vertex connection search

**User request:** Check the search bar for bugs when finding vertices and their connections.

**Findings and fixes:**

- Search results referenced `elementKey` without importing it, causing a runtime error whenever a nonempty result list rendered. Added the import and extracted the result markup into a testable component in `SearchPanel.jsx`.
- Editing the query or toggling Exact match did not invalidate an in-flight search. Old results could arrive and automatically focus the previous query's node. Both edits now clear old results, cancel the request, and allow a new submission immediately. Reset and unmount also cancel; request identity still rejects late responses from implementations that ignore abort signals.
- Manually selecting a result inherited the previous node's incoming/outgoing filter, while automatic selection used both directions. All search-result selection now starts with BOTH.
- A malformed successful response could enter state before failing during rendering. Added search-specific metadata/vertex validation in `search.js` so invalid payloads produce a visible error instead.

**Validation:** All **61 tests passed** and the production build passed. Nine added regression tests cover populated search-result rendering, distinct numeric/string result keys, selecting both relationship directions, initial/empty/limited result markup, live query encoding and signals, demo matching, scan/result limits, malformed payloads, request cancellation, and out-of-order responses. JSX component checks use Vite and React server rendering without network sockets or new dependencies. Full browser interaction and live HugeGraph integration remain unverified under the existing environment restrictions. No database mutation was performed.

## 2026-11-12 — Collapsible icon navigation

**User request:** Make the side navigation collapsible so it shows only icons.

**Implementation:** Added a round chevron toggle beside the sidebar logo. Desktop and tablet navigation collapses into a 76-pixel icon rail, and the main content expands into the available space. Hide navigation text, section headings, graph metadata, and the research note in the collapsed state. Keep the logo, graph/dashboard/vertex/edge icons, connection guide, status dot, and active-page highlight. Add accessible names, hover titles, active-page attributes, and toggle state. Remember the desktop preference in local storage with a safe fallback when storage is unavailable. Phone navigation keeps its existing full slide-out menu; compact styles apply only above the mobile breakpoint. Width transitions honor reduced-motion preferences.

**Validation:** All **61 tests passed** and the production build passed. Additional React server-rendering smoke checks passed for expanded/collapsed state, accessible navigation links, active-page state, toggle attributes, and unavailable storage. No new dependencies. Browser layout and pointer interaction remain unverified under the previously identified Chromium restrictions.

## 2026-11-12 — Dedicated Connected Nodes page

**User request:** Create a React page named Connected Nodes for search connections, and turn the existing Connected Nodes card into options for opening details.

**Implementation:**

- Added `ConnectedNodesPage.jsx` and a Connected Nodes entry in the workspace tabs and sidebar, including a distinct icon for collapsed navigation.
- Replaced the dashboard's long connection inspector with a compact selected-node summary and links to all, incoming, or outgoing connection details.
- The new page supports searching again, selected-node properties, grouped connected-node cards, direction filters, node properties, directed relationships, relationship IDs/properties, following another node, refresh, retry/error states, and 12-card pagination. Preserve each parallel relationship and self-link; distinct neighbor counts exclude the selected node.
- Added `routes.js` to encode selected typed IDs and direction in refreshable/bookmarkable hash URLs. Invalid or ambiguous node/direction links show recovery guidance. Existing dashboard and table routes remain available.
- Shared Live/Demo neighborhood loading and response validation in `connections.js`. Abort page requests on navigation, associate responses with their selection, and invalidate pending searches when page navigation changes. Separate starting another search from resetting the selected node so searches can complete on the details page.

**Validation:** All **73 tests passed** and the production build passed. Twelve new regression tests cover route round-trips, invalid links, typed IDs, Live/Demo direction loads, request signals and error handling, parallel/self relationships, dashboard summary links, detail rendering/properties, empty/limited states, pagination, direct-link loading, and the active page's heading/navigation. Tests use mocked API responses, local fixtures, and React server rendering through Vite without sockets. Full browser interaction and live HugeGraph integration remain unverified under the existing Chromium/environment restrictions. No new dependencies or database mutations.

## 2026-11-12 — Move Connected Nodes into a full-width dashboard card

**User request:** Revert the separate Connected Nodes page and show connection details in a large card below the graph and search panel.

**Implementation:** Removed the dedicated page, its route helper, extra navigation/tab/icon, and page-only search behavior. Restored the three existing workspace views while preserving the collapsible sidebar, search fixes, and graph spacing. Rebuilt `ConnectionsPanel.jsx` as a full-width dashboard card placed after the graph/search row. The card stays visible with guidance before selection, then displays selected-node properties, connected-node cards, directed relationships, relationship details, incoming/outgoing filters, refresh/retry/clear controls, and 12-card pagination. Following a connected node updates the current dashboard instead of navigating. Preserve typed IDs, parallel relationships, self-links, and bounded-load warnings. Cancel superseded neighborhood requests and retain stale-response guards. Updated search guidance and README.md for the new placement.

**Validation:** All **73 tests passed** and the production build passed. Replaced page/URL-specific tests with card tests for its position outside and below the graph/search row, empty/loading/error states, detailed properties, direction and refresh/retry/clear actions, following a connected node without navigation, pagination, and removal of the dedicated navigation entry. Existing loader, grouping, search, backend, and graph-layout checks also pass. Browser interaction and live HugeGraph integration remain unverified under the previously recorded environment restrictions. No new dependencies or database mutations.

## Future update entry template

```markdown
## YYYY-MM-DD — Update title

**User request:** What changed or was requested.

**Implementation:** Files/features changed and resulting behavior.

**Validation:** Checks performed and their results.

**Open items:** Any limitations or remaining work.
```
