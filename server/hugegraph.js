import { randomUUID } from 'node:crypto';

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export function readConfig(env = process.env) {
  const positive = (key, fallback) => {
    const value = Number(env[key] || fallback);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`);
    return value;
  };
  const url = new URL(env.HUGEGRAPH_URL || 'http://127.0.0.1:8080');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HUGEGRAPH_URL must use HTTP or HTTPS');
  if (url.href.includes('?') || url.href.includes('#')) throw new Error('HUGEGRAPH_URL must not contain a query string or fragment');
  if (url.username || url.password) throw new Error('Use HUGEGRAPH_USERNAME and HUGEGRAPH_PASSWORD instead of credentials in HUGEGRAPH_URL');
  const mode = env.HUGEGRAPH_API_MODE || 'auto';
  if (!['auto', 'legacy', 'graphspace'].includes(mode)) throw new Error('Invalid HUGEGRAPH_API_MODE');
  return {
    url: url.toString().replace(/\/+$/, ''), mode,
    graphspace: env.HUGEGRAPH_GRAPHSPACE || 'DEFAULT',
    username: env.HUGEGRAPH_USERNAME, password: env.HUGEGRAPH_PASSWORD,
    token: env.HUGEGRAPH_TOKEN, allowCreate: env.HUGEGRAPH_ALLOW_CREATE === 'true',
    timeout: positive('HUGEGRAPH_TIMEOUT_MS', 15000),
    maxElements: positive('HUGEGRAPH_MAX_ELEMENTS', 10000),
    maxScan: positive('HUGEGRAPH_MAX_SCAN', 100000),
  };
}

export class HugeGraphClient {
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; this.resolvedMode = null; this.creating = new Set(); }

  async request(path, options = {}) {
    const headers = { Accept: 'application/json', ...options.headers };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
    else if (this.config.username) headers.Authorization = `Basic ${Buffer.from(`${this.config.username}:${this.config.password || ''}`).toString('base64')}`;
    let response;
    let text;
    const signal = AbortSignal.timeout(this.config.timeout);
    try {
      response = await this.fetcher(`${this.config.url}${path}`, { ...options, headers, signal });
      text = await response.text();
    } catch (error) {
      const timedOut = error.name === 'TimeoutError' || signal.reason?.name === 'TimeoutError';
      throw new ApiError(502, timedOut
        ? 'HugeGraph took too long to respond. Try again or increase HUGEGRAPH_TIMEOUT_MS.'
        : 'Cannot reach HugeGraph Server. Check HUGEGRAPH_URL in .env and the Docker port mapping.',
      timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE');
    }
    let body;
    let validJson = true;
    try { body = text ? JSON.parse(text) : {}; } catch { validJson = false; }
    if (!response.ok) throw new ApiError(response.status, String(body?.message || `HugeGraph returned HTTP ${response.status}`).slice(0, 1200));
    if (!validJson) {
      const html = /text\/html/i.test(response.headers.get('content-type') || '') || /^\s*</.test(text);
      throw new ApiError(502, html
        ? 'The configured address returned a web page instead of the HugeGraph API. It may be the Hubble interface (usually port 8088). Set HUGEGRAPH_URL in .env to HugeGraph Server (usually http://127.0.0.1:8080), then restart the portal.'
        : 'The configured address did not return valid HugeGraph JSON. Check HUGEGRAPH_URL in .env points to HugeGraph Server, then restart the portal.', 'INVALID_API_RESPONSE');
    }
    return body;
  }

  async listGraphs(root) {
    const data = await this.request(root);
    const names = Array.isArray(data?.graphs) ? data.graphs.map(graph => typeof graph === 'string' ? graph : graph?.name) : null;
    if (!names || names.some(name => typeof name !== 'string' || !name)) {
      throw new ApiError(502, 'This address did not return a HugeGraph graph list. Check that HUGEGRAPH_URL points to HugeGraph Server (usually port 8080), not the Hubble web interface (usually port 8088).', 'INVALID_API_RESPONSE');
    }
    return names.map(name => ({ name }));
  }

  async root() {
    if (this.config.mode !== 'auto') return this.config.mode === 'legacy' ? '/graphs' : `/graphspaces/${encodeURIComponent(this.config.graphspace)}/graphs`;
    if (this.resolvedMode) return this.resolvedMode;
    const scoped = `/graphspaces/${encodeURIComponent(this.config.graphspace)}/graphs`;
    try { await this.listGraphs(scoped); this.resolvedMode = scoped; }
    catch (error) {
      if (error.status !== 404 && error.code !== 'INVALID_API_RESPONSE' && !(error.status === 400 && /not supported in standalone mode/i.test(error.message))) throw error;
      try { await this.listGraphs('/graphs'); }
      catch (fallbackError) {
        if (error.code === 'INVALID_API_RESPONSE' && fallbackError.status === 404) throw error;
        throw fallbackError;
      }
      this.resolvedMode = '/graphs';
    }
    return this.resolvedMode;
  }

  async graphPath(graph) { return `${await this.root()}/${encodeURIComponent(graph)}`; }

  async graphs() {
    return this.listGraphs(await this.root());
  }

  async page(graph, kind, { page = '', limit = 100, vertexId, direction = 'BOTH' } = {}) {
    const params = new URLSearchParams({ page, limit: String(limit) });
    if (vertexId !== undefined) {
      params.set('vertex_id', JSON.stringify(vertexId));
      params.set('direction', direction);
    }
    const result = await this.request(`${await this.graphPath(graph)}/graph/${kind}?${params}`);
    if (!Array.isArray(result?.[kind]) || result[kind].length > limit ||
        (result.page != null && typeof result.page !== 'string') ||
        result[kind].some(item => !validElement(item, kind))) {
      throw new ApiError(502, `Unexpected HugeGraph ${kind} response.`, 'INVALID_API_RESPONSE');
    }
    return { items: result[kind], nextPage: result.page || null };
  }

  async collect(graph, kind, max, options = {}) {
    const items = []; let page = ''; const seen = new Set();
    do {
      const result = await this.page(graph, kind, { ...options, page, limit: Math.min(500, max - items.length) });
      items.push(...result.items); page = result.nextPage;
      if (page && seen.has(page)) throw new ApiError(502, 'HugeGraph returned a repeated pagination cursor.');
      seen.add(page);
    } while (page && items.length < max);
    return { items, truncated: Boolean(page), nextPage: page };
  }

  async snapshot(graph) {
    const [vertices, edges] = await Promise.all([
      this.collect(graph, 'vertices', this.config.maxElements),
      this.collect(graph, 'edges', this.config.maxElements),
    ]);
    return { vertices: vertices.items, edges: edges.items, truncated: vertices.truncated || edges.truncated, limit: this.config.maxElements };
  }

  async search(graph, { property = '', value = '', label = '', exact = false }) {
    const result = await this.collect(graph, 'vertices', this.config.maxScan);
    const needle = value.toLowerCase();
    const matches = result.items.filter(vertex => {
      if (label && vertex.label !== label) return false;
      if (!value) return true;
      const properties = vertex.properties || {};
      const values = property ? [Object.hasOwn(properties, property) ? properties[property] : undefined] : [vertex.id, vertex.label, ...Object.values(properties)];
      return values.some(item => item !== undefined && (exact ? displayValue(item).toLowerCase() === needle : displayValue(item).toLowerCase().includes(needle)));
    });
    return { vertices: matches.slice(0, 100), totalMatches: matches.length, scanned: result.items.length, truncated: result.truncated, resultsLimited: matches.length > 100 };
  }

  async neighbors(graph, id, direction = 'BOTH') {
    if (!['BOTH', 'OUT', 'IN'].includes(direction)) throw new ApiError(400, 'Choose all, outgoing, or incoming relationships.');
    const result = await this.collect(graph, 'edges', this.config.maxElements, { vertexId: id, direction });
    const ids = new Map([[JSON.stringify(id), id]]);
    result.items.forEach(edge => { ids.set(JSON.stringify(edge.outV), edge.outV); ids.set(JSON.stringify(edge.inV), edge.inV); });
    const vertices = [];
    const allIds = [...ids.values()];
    // Bound concurrent requests when a vertex has many neighbors.
    for (let i = 0; i < allIds.length; i += 12) {
      const batch = await Promise.all(allIds.slice(i, i + 12).map(async vertexId => {
        const vertex = await this.request(`${await this.graphPath(graph)}/graph/vertices/${encodeURIComponent(JSON.stringify(vertexId))}`);
        if (!validElement(vertex, 'vertices') || vertex.id !== vertexId) {
          throw new ApiError(502, 'Unexpected HugeGraph vertex response.', 'INVALID_API_RESPONSE');
        }
        return vertex;
      }));
      vertices.push(...batch);
    }
    return { vertices, edges: result.items, truncated: result.truncated, limit: this.config.maxElements };
  }

  async creationTemplate(template) {
    // Standalone servers can list at /graphs while managing at /graphspaces/…/graphs.
    // Resolve the write endpoint using read-only graph details, before any mutation.
    const scoped = `/graphspaces/${encodeURIComponent(this.config.graphspace)}/graphs`;
    const roots = this.config.mode === 'auto' ? [scoped, '/graphs'] : [await this.root()];
    for (const [index, root] of roots.entries()) {
      try {
        const details = await this.request(`${root}/${encodeURIComponent(template)}`);
        if (details?.name !== template || typeof details.backend !== 'string') throw new ApiError(502, 'Could not verify the template graph storage backend.', 'INVALID_API_RESPONSE');
        return { root, backend: details.backend.toLowerCase() };
      } catch (error) {
        const unsupported = error.status === 404 || error.code === 'INVALID_API_RESPONSE' || (error.status === 400 && /not supported in standalone mode/i.test(error.message));
        if (!unsupported || index === roots.length - 1) throw error;
      }
    }
  }

  async createGraph(name, template) {
    if (!this.config.allowCreate) throw new ApiError(403, 'Graph creation is disabled by HUGEGRAPH_ALLOW_CREATE.');
    if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name)) throw new ApiError(400, 'Use 1–48 letters, numbers, or underscores, starting with a letter.');
    if (typeof template !== 'string' || !template) throw new ApiError(400, 'Choose an existing graph as the configuration template.');
    if (this.creating.has(name)) throw new ApiError(409, 'This graph is already being created. Check the graph list before trying again.');
    this.creating.add(name);
    try {
      const graphs = await this.graphs();
      if (graphs.some(graph => graph.name === name)) throw new ApiError(409, 'A graph with that name already exists.');
      if (!graphs.some(graph => graph.name === template)) throw new ApiError(400, 'Choose an existing graph as the configuration template.');
      const { root, backend } = await this.creationTemplate(template);
      if (!['rocksdb', 'memory'].includes(backend)) throw new ApiError(400, `Creation from a ${backend} template needs backend-specific storage configuration. Choose a RocksDB or memory graph.`);
      const config = { store: name };
      if (backend === 'rocksdb') {
        const directory = `./rks-data/${name}-${randomUUID()}`;
        config['rocksdb.data_path'] = directory;
        config['rocksdb.wal_path'] = directory;
      }
      const legacy = root === '/graphs';
      try {
        const result = await this.request(`${root}/${encodeURIComponent(name)}?clone_graph_name=${encodeURIComponent(template)}`, {
          method: 'POST', headers: { 'Content-Type': legacy ? 'text/plain' : 'application/json' },
          body: legacy ? Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') : JSON.stringify(config),
        });
        if (result?.name !== name) throw new ApiError(502, 'Unexpected graph creation response.', 'INVALID_API_RESPONSE');
        return { name: result.name, backend };
      } catch (error) {
        if (!(error instanceof ApiError) || error.status >= 500 || error.status === 408 || error.code === 'INVALID_API_RESPONSE') throw new ApiError(502, 'Graph creation could not be confirmed. The graph may already exist. Check the graph list before trying again.', 'CREATION_UNCERTAIN');
        if ([401, 403].includes(error.status)) throw new ApiError(error.status, 'HugeGraph denied graph creation. Configure a server account with graph management permission and verify that dynamic creation is supported by your server version.');
        if ([404, 405].includes(error.status)) throw new ApiError(error.status, 'This HugeGraph server does not expose graph creation at the configured API. Check its version and HUGEGRAPH_API_MODE.');
        throw error;
      }
    } finally { this.creating.delete(name); }
  }
}

function displayValue(value) { return typeof value === 'object' ? JSON.stringify(value) : String(value); }

function validId(id) { return typeof id === 'string' || Number.isSafeInteger(id); }

function validElement(element, kind) {
  if (!element || typeof element !== 'object' || Array.isArray(element)) return false;
  if (!validId(element.id) || typeof element.label !== 'string' || !element.label) return false;
  if (element.properties != null && (typeof element.properties !== 'object' || Array.isArray(element.properties))) return false;
  return kind !== 'edges' || (validId(element.outV) && validId(element.inV));
}
