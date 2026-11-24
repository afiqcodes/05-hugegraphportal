# HugeGraph Portal

A local research portal for exploring the Apache HugeGraph databases you already view in Hubble. It uses a retro, playful interface with purple, white, blue, black, and lime; bold borders; offset shadows; and small graph illustrations.

**Configured connection:** `http://127.0.0.1:8080`, without credentials. The user confirmed this address returns the four graphs `example_01`, `hugegraph`, `mydatabase`, and `school_database`. Port `8088` usually serves the Hubble web interface. **Graph creation is enabled in the supplied `.env`**. Restart the portal backend to load this setting; availability also depends on your HugeGraph version and permissions. The portal does not insert sample data into your database.

## Technology

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | HTML, CSS, JavaScript, React 19 | Pages, forms, navigation, state, and responsive layout |
| Frontend tooling | Vite 7 | Development server, API proxy, and production build |
| Graph visualization | Cytoscape.js | Interactive directed graph, layouts, zoom, drag, hover, and selection |
| Backend | Node.js and Express 5 | HugeGraph REST adapter, validation, pagination, search, and production static hosting |
| Database | Your existing Apache HugeGraph Server | Graphs, vertices, edges, and properties |
| Documentation | README.md and LOGBOOK.md | Implementation guide and dated request/update history |

Hubble is another client of HugeGraph Server. The portal reads the **server's REST API**, rather than the Hubble web interface or Hubble's internal connection catalog. It lists graphs exposed by the configured server and graph space. Graphs registered in Hubble on different servers require separate portal configuration.

## Run locally

Requires Node.js **22.12 or later** (a current LTS release is suitable), npm, and your running HugeGraph Server with its port exposed by Docker. This project does not start, replace, or modify your database containers.

```bash
npm install
```

A local `.env` has been prepared for the standard HugeGraph Server API port, correcting the earlier Hubble-port setting. On another checkout, copy the example first:

```bash
cp .env.example .env
```

Confirm these values in `.env`:

```dotenv
HUGEGRAPH_URL=http://127.0.0.1:8080
HUGEGRAPH_API_MODE=auto
HUGEGRAPH_GRAPHSPACE=DEFAULT
HUGEGRAPH_ALLOW_CREATE=true
PORT=3001
HOST=127.0.0.1
```

Then start both the frontend and backend:

```bash
npm run dev
```

Open the **Local URL printed by Vite**, normally **http://127.0.0.1:5173**. The frontend proxies `/api` to Express on port 3001. Stop both processes with Ctrl+C. If you change `PORT`, also update the proxy target in `vite.config.js` for development.

To run the production build using Express only:

```bash
npm run build
npm start
```

Open **http://127.0.0.1:3001**. The default bind address is localhost. The portal is intended for local use; it does not include user accounts or portal authorization for shared network hosting.

## Portal flow

On desktop and tablet, use the round chevron beside the sidebar logo to collapse navigation into a 76-pixel icon rail or expand it again. Hover over an icon for its name; the active page stays highlighted. The portal remembers the choice in browser local storage and gives the main content the freed space. Phones keep the full slide-out menu opened by the top-bar menu button.

1. **Starting page:** Choose Live or Demo. Live requests the graph names from your configured HugeGraph Server. Search by graph name, sort A–Z/Z–A, and browse four-column card grids with up to **16 graphs per page** (four rows). The layout uses fewer columns on smaller screens. Empty slots are not filled with invented graphs.
2. **Dashboard / Explore:** Open a graph to load its vertices and edges. Drag nodes, pan, scroll to zoom, fit, or rearrange the graph. Directed arrows and edge labels show the relationships. Hover over a node for its properties; click it to load its connected nodes and relationships from the server.
3. **Find a node:** Use the right-hand panel to search a node name, ID, label, or property value across all node types in the current graph, including outside the canvas. Search is case-insensitive; **Exact match** compares complete values. Editing the query or toggling Exact match clears old results and cancels the pending search. A single complete match opens automatically; otherwise select a result. Selecting a search result starts with both relationship directions. The large **Connected Nodes** card below the graph and search panel updates with the selected node's connections. **Reset** or **Show full graph** restores the original bounded canvas view.
4. **Connected Nodes card:** The dashboard has a full-width card below both the graph and search panel. Before selection, it explains how to find a node. After a search-result or graph-node selection, it shows the selected node's properties and one card per connected node, with expandable properties, directed source → relationship → target paths, and relationship IDs/properties. Parallel relationships stay together; self relationships remain visible without increasing the distinct neighbor count. Filter all/incoming/outgoing directions, refresh, retry a failed load, clear the selection, or explore another node's connections in the same graph and card. Cards paginate in groups of 12. Node IDs retain their numeric/string identity. Pending neighborhood requests are cancelled when a new selection replaces them, on Reset/clear, or on unmount.
5. **Workspace / Vertices:** Browse server-paginated vertex IDs, labels, names, and properties. Expand a row to inspect all properties.
6. **Workspace / Edges:** Browse server-paginated edge IDs, labels, **source (`outV`)**, **target (`inV`)**, and properties. Arrows run from source to target.
7. **New graph:** In Live mode, enter a unique graph name and choose an existing RocksDB or memory graph as a storage template. The portal creates a separate empty graph and opens its workspace. Schema, nodes, and relationships are not copied; add schema and data through Hubble or HugeGraph. Memory graphs do not persist across server restarts. Creation remains unavailable in Demo mode.

Both tables fetch 50 records at a time and use the server's opaque pagination cursors, with previous/next navigation. Their filter searches **the current page only**; use **Find a node** to search across the graph. Use Refresh to pick up data inserted through Hubble. There is no automatic polling or live streaming.

### How graph spacing works

The canvas uses one layout configuration in `src/graphLayout.js` for both initial loading and **Rearrange graph**:

1. Run Cytoscape's CoSE layout with `nodeDimensionsIncludeLabels: true`, so node names count toward the space each vertex occupies.
2. Increase node repulsion from 15,000 to 45,000 and preferred edge length from 140 to 180 model units. Give disconnected groups 150 units of spacing and reduce gravity to 0.2 so groups cluster less tightly.
3. Wrap node names at 120 units instead of truncating them. In `src/GraphCanvas.jsx`, offset relationship labels 10 units above their anchor, give labels opaque backgrounds, and use a 70-unit curve step to separate parallel relationships. Edge endpoints respect node labels as well as node bodies.
4. After CoSE finishes, measure the actual bounding box of every node including its name. Expand node positions only if needed to leave at least 16 model units between those boxes. This extra pass handles label overlaps that the force simulation can leave behind.
5. Fit the completed layout into the canvas with 70 pixels of padding. **Rearrange graph** repeats all these steps; zoom and dragging remain available.

Spacing is applied to the visualization in the browser. Dense graphs can still have crossing edges or overlapping relationship labels; the layout does not guarantee a drawing without crossings. Dragging nodes can introduce overlaps again; use **Rearrange graph** to restore spacing.

## Live and Demo modes

Live is the default. If HugeGraph is unreachable, the portal displays the actual connection error and an explicit option to explore Demo. It never silently substitutes sample data for live results.

Demo contains four in-memory example graphs about researchers, projects, institutions, and fields. The data is bundled with the frontend and resets on reload. Demo does not access or write HugeGraph. The selected Live/Demo mode is remembered in the browser tab's session storage.

## How it is made

```text
Browser / React
  ├── Graph library, dashboard, search, and workspace tables
  ├── Cytoscape canvas (loaded only when needed)
  └── /api requests
           ↓
Node.js / Express
  ├── Configuration from .env (never sent to the browser)
  ├── Validates inputs and normalizes HugeGraph responses
  ├── Reads pages, scans properties, and retrieves neighborhoods
  └── HugeGraph REST requests
           ↓
Your Docker-hosted HugeGraph Server :8080
           ↑
         Hubble
```

React uses hash URLs, so reloading or bookmarking a graph page works without additional route configuration. The backend is the only part that knows the HugeGraph URL or optional credentials. No browser CORS change to HugeGraph is necessary because requests go through Express.

The server detects `/graphspaces/{space}/graphs` first and validates that it actually returns a JSON graph list before caching the API mode. It falls back to legacy `/graphs` when the scoped API is unavailable (404 or the explicit standalone-mode unsupported response), or when a catch-all route returns HTML or unrelated JSON. Authentication errors are preserved. HTML responses explain the likely Hubble/Server port mismatch. Set `HUGEGRAPH_API_MODE=graphspace` or `legacy` to choose explicitly. A gateway prefix in `HUGEGRAPH_URL` is preserved. Query strings, fragments, and embedded credentials are rejected at startup; use the separate authentication variables for credentials.

Node search reads paginated vertices and compares IDs, labels, and property values in Node.js. It does not interpolate user input into Gremlin, requires no prebuilt property indexes, and supports existing research datasets. Large databases would benefit from indexed server-side queries as a future optimization.

## Data bounds and performance

The dashboard reads all available pages up to `HUGEGRAPH_MAX_ELEMENTS` (default **10,000 vertices and 10,000 edges**). It reports loaded counts, not total database counts. When capped, a visible warning explains that more data exists. An edge whose endpoints are outside the loaded vertex set is omitted from the canvas and reported. Node connection loading resolves endpoint vertices directly, including those outside the initial snapshot.

Node search scans up to `HUGEGRAPH_MAX_SCAN` (default **100,000 vertices**) and returns the first **100 matches**. It reports scan bounds and result limits; refine the search text or choose Exact match if needed. Neighborhood edges are subject to `HUGEGRAPH_MAX_ELEMENTS` too. A per-request timeout defaults to 15 seconds. A scan consists of multiple bounded requests and can take longer than that in total.

Use smaller canvas limits for dense graphs or slower machines. The workspace tables allow pagination through all records without loading the entire database into the browser. Searches and snapshots are separate reads, not a transactionally consistent database snapshot; concurrent Hubble edits may require a refresh.

## Configuration reference

| Variable | Default | Meaning |
| --- | --- | --- |
| `HUGEGRAPH_URL` | `http://127.0.0.1:8080` | HugeGraph Server origin, optionally with gateway prefix; use the Server container's published host port |
| `HUGEGRAPH_API_MODE` | `auto` | `auto`, `graphspace`, or `legacy` |
| `HUGEGRAPH_GRAPHSPACE` | `DEFAULT` | Graph space to browse |
| `HUGEGRAPH_ALLOW_CREATE` | `false` | Only the literal value `true` enables graph creation |
| `HUGEGRAPH_USERNAME`, `HUGEGRAPH_PASSWORD` | Empty | Optional server Basic authentication |
| `HUGEGRAPH_TOKEN` | Empty | Optional bearer token, taking precedence over Basic auth |
| `HUGEGRAPH_TIMEOUT_MS` | `15000` | Timeout for each upstream request |
| `HUGEGRAPH_MAX_ELEMENTS` | `10000` | Per-type canvas and neighborhood edge limit |
| `HUGEGRAPH_MAX_SCAN` | `100000` | Maximum nodes inspected for a node search |
| `PORT` | `3001` | Express port |
| `HOST` | `127.0.0.1` | Express bind address |

`.env` is ignored by version control. Restart the Node server after editing it. The optional Google Fonts stylesheet enhances typography; system font fallbacks work without internet. No graph data is sent to that font service.

### Graph creation

Graph creation is enabled in the supplied `.env` and `.env.example`; the code defaults to disabled when the variable is absent. Set `HUGEGRAPH_ALLOW_CREATE=false` to disable it. An existing graph supplies the **storage configuration template**. The backend checks its storage type before writing and supports RocksDB and memory; other backends return an explanatory error before creation. Each graph receives a separate `store` name and RocksDB graphs receive a unique directory for their data and WAL. Schema, vertices, and edges are not copied.

The backend resolves the management endpoint using read-only graph details independently of the listing endpoint, since some standalone servers list at `/graphs` while managing graphs at `/graphspaces/{space}/graphs`. It sends legacy text/plain or scoped JSON as appropriate. Duplicate names, invalid names, and concurrent submissions for the same name are rejected. A creation POST is never automatically retried. If its response is lost, times out, fails on the server, or cannot be verified, the form asks you to **Check graph list** before submitting again. The modal cannot be dismissed while a creation request is pending.

Dynamic creation availability depends on the exact HugeGraph image and authentication/backend configuration. The [1.7 Graphs API documentation](https://hugegraph.apache.org/versions/1.7/docs/clients/restful-api/graphs/) requires authentication for dynamic creation; the [current master documentation](https://hugegraph.apache.org/docs/clients/restful-api/graphs/) documents different standalone behavior. The Docker tag `latest` is mutable and does not identify an exact installed release. The portal reports permission or unsupported-endpoint errors directly; enabling the local setting does not grant server permissions.

## API endpoints

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/health` | Connection check, resolved API root, creation capability |
| GET | `/api/graphs` | Graph names and creation capability |
| GET | `/api/graphs/:graph/snapshot` | Bounded graph data and truncation metadata |
| GET | `/api/graphs/:graph/vertices?page=&limit=50` | Vertex page and next cursor |
| GET | `/api/graphs/:graph/edges?page=&limit=50` | Edge page and next cursor |
| GET | `/api/graphs/:graph/search?value=node1&exact=true` | Matching nodes across all types and scan metadata |
| GET | `/api/graphs/:graph/neighbors?id=%22person%3Aada%22&direction=BOTH` | Selected node, incident relationships, endpoint nodes, and truncation limit |
| POST | `/api/graphs` | Creates a graph (201) when enabled; body `{ "name": "new_graph", "template": "existing_graph" }` |

`neighbors.id` must be a JSON string or safe integer so numeric and string vertex IDs remain distinct. User values are URL-encoded. `neighbors.direction` accepts `BOTH` (default), `OUT`, or `IN`. Query parameters must have a single value; `search.exact` accepts `true` or `false`. Malformed upstream records and vertex responses with mismatched IDs return an API error before reaching the browser. Numeric graph element IDs and endpoint IDs must be safe integers; strings retain their original type. The search API retains optional `label` and `property` filters for API clients; the panel searches all node types and property values. Browse and search routes perform upstream GETs only. There are no delete, data update, or arbitrary Gremlin-execution endpoints.

## Project structure

```text
src/
  App.jsx          Pages, graph creation, workspace state, dialogs
  ConnectionsPanel.jsx  Full-width connected nodes card, properties, filters, and pagination
  SearchPanel.jsx  Node search, result selection, and reset
  search.js        Search requests, cancellation, and response validation
  PropertyList.jsx Shared property formatting
  DataTable.jsx    Paginated vertex/edge tables and property rows
  Pagination.jsx   Shared previous/next page controls
  Feedback.jsx     Shared loading, notice, and empty states
  GraphCanvas.jsx  Cytoscape visualization, tooltip, zoom, and selection
  graphLayout.js   Shared layout and node-label overlap correction
  Icons.jsx        Small inline SVG icon set
  api.js           API helper and value/ID formatting
  connections.js   Connection loading, directed relationships, and grouped nodes
  demo.js          Explicitly separate sample dataset
  main.jsx         React entry and error boundary
  styles.css       Design system and responsive layouts
server/
  app.js           Express routes, validation, static hosting, error handling
  hugegraph.js     HugeGraph adapter, pagination, search, neighborhoods
  index.js         Local server entry
scripts/dev.mjs    Starts and stops Vite and Express together
tests/hugegraph.test.js
tests/connections.test.js
tests/api.test.js
tests/app.test.js
tests/demo.test.js
tests/graph-layout.test.js
tests/search.test.js
tests/connected-nodes.test.js
.env.example
README.md
LOGBOOK.md
```

## Verification and current limits

```bash
npm test
npm run build
```

The 73 automated tests use mocked HTTP responses and local graph fixtures. Coverage includes API detection, malformed responses and cursors, interrupted response bodies and timeouts, authentication, gateway URLs, pagination, bounded scans, creation validation and storage isolation, separate listing/management endpoints, unsupported backends, concurrent submissions, uncertain creation outcomes, browser API response validation, node lookup across types, directed connections, typed IDs, self-links, parallel relationships, isolated nodes, demo data consistency, Express route validation, malformed graph records, endpoint ID verification, URL validation, and custom request headers. Layout coverage includes simulated wide/wrapped label bounds, coincident positions, empty/single-node inputs, unchanged positions when spacing is sufficient, and initial/repeated headless layouts for all demo graphs. Search coverage includes populated component rendering, typed result keys, result-selection direction, live query encoding, demo matching, result/scan limits, malformed payload rejection, request cancellation, and out-of-order response guards. Connected Nodes coverage includes direction-aware loads, grouped/parallel/self relationships, detailed properties, empty/loading/error states, refresh/retry/clear controls, following a node without navigation, pagination, card placement below the graph/search row, and removal of the dedicated page navigation. Search and connection-card JSX load through Vite with sockets disabled; React server rendering checks the result markup without a browser. Route tests exercise Express without opening a port. They do not mutate your database.

The production build and all 73 tests passed after moving Connected Nodes into a full-width dashboard card. Additional React server-rendering smoke checks covered expanded/collapsed sidebar state, accessible icon labels, active-page state, toggle attributes, and unavailable browser storage. The user previously confirmed a host-side request to `http://127.0.0.1:8080/graphs` returns HTTP 200 and four graph names. Live HugeGraph integration and browser interaction remain unverified; Chromium still fails to launch under this environment's socket restrictions. Headless layout tests do not measure browser-rendered text. Dashboard/vertex/edge display still needs to be checked by launching the portal on the host where HugeGraph runs. No database mutation was performed.

### Troubleshooting the connection

Run on your machine:

```bash
curl http://127.0.0.1:8080/versions
curl http://127.0.0.1:8080/graphs
curl http://127.0.0.1:8080/graphspaces/DEFAULT/graphs
```

If `/versions` returns a Hubble HTML page rather than HugeGraph version JSON, use the HugeGraph Server address recorded in your Hubble connection settings. Hubble normally opens on port 8088; it is a separate viewer and cannot serve as this portal's database API. If the connection is refused, check that the Server container is running and inspect its published port using `docker ps`. For example, `0.0.0.0:18080->8080/tcp` means use `http://127.0.0.1:18080`. Restart the portal after changing `.env`, then choose Live and refresh. If the portal later runs inside Docker, `127.0.0.1` refers to that portal container; use the HugeGraph service name on a shared Docker network instead.

The default port distinction is documented in the [official Hubble standalone setup guide](https://hugegraph.apache.org/docs/quickstart/toolchain/hugegraph-hubble/).

Consult the [official REST reference](https://hugegraph.apache.org/docs/clients/restful-api/), [vertex pagination documentation](https://hugegraph.apache.org/versions/1.5/docs/clients/restful-api/vertex/), and [edge query documentation](https://hugegraph.apache.org/versions/1.5/docs/clients/restful-api/edge/) for the adapter contracts.
