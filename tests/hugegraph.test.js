import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, HugeGraphClient, readConfig } from '../server/hugegraph.js';

function client(handler, env = {}) {
  const requests = [];
  const instance = new HugeGraphClient(readConfig({ HUGEGRAPH_URL: 'http://hugegraph:8080', HUGEGRAPH_API_MODE: 'legacy', ...env }), async (url, options) => {
    const request = { url: new URL(url), ...options };
    requests.push(request);
    const result = await handler(request);
    return new Response(JSON.stringify(result.body ?? result), { status: result.status || 200 });
  });
  return { instance, requests };
}

test('creation is disabled by default and never contacts the server', async () => {
  const { instance, requests } = client(() => assert.fail('Creation must be blocked'));
  await assert.rejects(instance.createGraph('new_graph', 'hugegraph'), { status: 403 });
  assert.equal(requests.length, 0);
});

test('auto detects legacy API only when graph-space path is unavailable', async () => {
  const { instance, requests } = client(({ url }) => url.pathname.startsWith('/graphspaces') ? { status: 404 } : { graphs: ['research'] }, { HUGEGRAPH_API_MODE: 'auto' });
  assert.deepEqual(await instance.graphs(), [{ name: 'research' }]);
  await instance.graphs();
  assert.equal(requests.filter(req => req.url.pathname.startsWith('/graphspaces')).length, 1);
});

test('authentication errors are preserved instead of falling back to another API', async () => {
  const { instance, requests } = client(() => ({ status: 401, body: { message: 'Authentication required' } }), { HUGEGRAPH_API_MODE: 'auto' });
  await assert.rejects(instance.graphs(), { status: 401 });
  assert.equal(requests.length, 1);
});

test('HTML from Hubble produces an actionable server-port error', async () => {
  const instance = new HugeGraphClient(readConfig({}), async () => new Response('<!doctype html><html><title>HugeGraph Hubble</title></html>', { headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(instance.graphs(), error => error.status === 502 && /Hubble/.test(error.message) && /8080/.test(error.message));
  assert.equal(instance.resolvedMode, null);
});

test('a successful catch-all page cannot hide a working legacy graph API', async () => {
  const paths = [];
  const instance = new HugeGraphClient(readConfig({}), async url => {
    const path = new URL(url).pathname;
    paths.push(path);
    return path === '/graphs' ? Response.json({ graphs: ['existing_research'] }) : new Response('<html>Unknown route</html>', { headers: { 'Content-Type': 'text/html' } });
  });
  assert.deepEqual(await instance.graphs(), [{ name: 'existing_research' }]);
  assert.equal(instance.resolvedMode, '/graphs');
  assert.ok(paths.includes('/graphs'));
});

test('an invalid scoped JSON response is not cached and falls back to a valid legacy list', async () => {
  const { instance } = client(({ url }) => url.pathname === '/graphs' ? { graphs: ['actual_graph'] } : { data: {} }, { HUGEGRAPH_API_MODE: 'auto' });
  assert.deepEqual(await instance.graphs(), [{ name: 'actual_graph' }]);
  assert.equal(instance.resolvedMode, '/graphs');
});

test('an empty graph array is valid but malformed graph entries are rejected', async () => {
  const { instance } = client(() => ({ graphs: [] }), { HUGEGRAPH_API_MODE: 'auto' });
  assert.deepEqual(await instance.graphs(), []);
  assert.match(instance.resolvedMode, /graphspaces/);
  for (const body of [null, [], { graphs: [null] }, { graphs: [{}] }, { graphs: [''] }, { graphs: [{ name: '' }] }]) {
    const malformed = new HugeGraphClient(readConfig({ HUGEGRAPH_API_MODE: 'legacy' }), async () => Response.json(body));
    await assert.rejects(malformed.graphs(), { status: 502, code: 'INVALID_API_RESPONSE' });
  }
});

test('current graph-space APIs retain the configured space and gateway prefix', async () => {
  const { instance, requests } = client(() => ({ graphs: ['research'] }), { HUGEGRAPH_URL: 'http://hugegraph:8080/proxy', HUGEGRAPH_GRAPHSPACE: 'my space', HUGEGRAPH_API_MODE: 'graphspace' });
  await instance.graphs();
  assert.equal(requests[0].url.pathname, '/proxy/graphspaces/my%20space/graphs');
});

test('snapshot reads every page and reports explicit truncation', async () => {
  const { instance } = client(({ url }) => {
    if (url.pathname.endsWith('/edges')) return { edges: [], page: null };
    return url.searchParams.get('page') ? { vertices: [{ id: 2, label: 'person' }], page: 'more' } : { vertices: [{ id: 1, label: 'person' }], page: 'next+/=' };
  }, { HUGEGRAPH_MAX_ELEMENTS: '2' });
  const result = await instance.snapshot('research');
  assert.deepEqual(result.vertices.map(v => v.id), [1, 2]);
  assert.equal(result.truncated, true);
  assert.equal(result.limit, 2);
});

test('opaque cursors are forwarded without modification', async () => {
  const { instance, requests } = client(() => ({ vertices: [], page: null }));
  await instance.page('research', 'vertices', { page: 'next+/=', limit: 50 });
  assert.equal(requests[0].url.searchParams.get('page'), 'next+/=');
});

test('search scans beyond the initial canvas page without interpolating Gremlin', async () => {
  const { instance, requests } = client(({ url }) => url.searchParams.get('page') ? { vertices: [{ id: 'a', label: 'person', properties: { city: 'Kuala Lumpur', age: 29, active: true } }], page: null } : { vertices: [{ id: 'b', label: 'project', properties: { name: 'Other' } }], page: 'next' });
  const result = await instance.search('research', { property: 'city', value: 'lumpur', label: 'person' });
  assert.equal(result.vertices[0].id, 'a');
  assert.equal(result.scanned, 2);
  assert.equal(result.truncated, false);
  assert.ok(requests.every(req => req.url.pathname.endsWith('/vertices') && !req.method));
  const exact = await instance.search('research', { property: 'age', value: '29', exact: true });
  assert.equal(exact.totalMatches, 1);
  const hostile = await instance.search('research', { property: 'city', value: "');g.V().drop();//" });
  assert.equal(hostile.totalMatches, 0);
  const labelOnly = await instance.search('research', { value: '', label: 'person', exact: true });
  assert.equal(labelOnly.totalMatches, 1);
});

test('neighbors preserve numeric and string IDs and include all incident pages', async () => {
  const { instance, requests } = client(({ url }) => {
    if (url.pathname.endsWith('/edges')) {
      assert.equal(url.searchParams.get('vertex_id'), '7');
      if (url.searchParams.get('page')) return { edges: [{ id: 'e2', label: 'knows', outV: '7', inV: 7 }], page: null };
      return { edges: [{ id: 'e1', label: 'knows', outV: 7, inV: '1:a/b' }], page: 'next' };
    }
    const id = JSON.parse(decodeURIComponent(url.pathname.split('/').at(-1)));
    return { id, label: 'person', properties: {} };
  });
  const result = await instance.neighbors('research', 7);
  assert.equal(result.edges.length, 2);
  assert.deepEqual(new Set(result.vertices.map(v => JSON.stringify(v.id))), new Set(['7', '"7"', '"1:a/b"']));
  assert.ok(requests.some(req => req.url.pathname.includes('%221%3Aa%2Fb%22')));
});

test('enabled creation validates inputs, blocks duplicate names, and isolates RocksDB paths', async () => {
  const { instance, requests } = client(({ url, method }) => method === 'POST' ? { name: 'new_graph' } : url.pathname === '/graphs' ? { graphs: ['source'] } : { name: 'source', backend: 'rocksdb' }, { HUGEGRAPH_ALLOW_CREATE: 'true' });
  await assert.rejects(instance.createGraph('../bad', 'source'), { status: 400 });
  await assert.rejects(instance.createGraph(['new_graph'], 'source'), { status: 400 });
  await assert.rejects(instance.createGraph('new_graph', ['source']), { status: 400 });
  await assert.rejects(instance.createGraph('source', 'source'), { status: 409 });
  await assert.rejects(instance.createGraph('new_graph', 'unknown'), { status: 400 });
  await instance.createGraph('new_graph', 'source');
  const mutation = requests.find(req => req.method === 'POST');
  assert.equal(mutation.url.pathname, '/graphs/new_graph');
  assert.equal(mutation.url.searchParams.get('clone_graph_name'), 'source');
  assert.equal(mutation.headers['Content-Type'], 'text/plain');
  assert.match(mutation.body, /store=new_graph/);
  assert.match(mutation.body, /rocksdb.data_path=.\/rks-data\/new_graph-[a-f0-9-]{36}/);
  const config = Object.fromEntries(mutation.body.split('\n').map(line => line.split('=')));
  assert.equal(config['rocksdb.data_path'], config['rocksdb.wal_path']);
});

test('current creation uses JSON and never retries a write with another API', async () => {
  const { instance, requests } = client(({ method, url }) => method === 'POST' ? { status: 403, body: { message: 'Graph management requires authentication' } } : url.pathname.endsWith('/source') ? { name: 'source', backend: 'rocksdb' } : { graphs: ['source'] }, { HUGEGRAPH_ALLOW_CREATE: 'true', HUGEGRAPH_API_MODE: 'graphspace' });
  await assert.rejects(instance.createGraph('new_graph', 'source'), { status: 403 });
  const mutations = requests.filter(req => req.method === 'POST');
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(mutations[0].body).store, 'new_graph');
});

test('network failures produce an actionable error without exposing auth credentials', async () => {
  const instance = new HugeGraphClient(readConfig({ HUGEGRAPH_TOKEN: 'secret' }), async () => { throw new Error('ECONNREFUSED secret'); });
  await assert.rejects(instance.graphs(), error => error instanceof ApiError && error.status === 502 && /HUGEGRAPH_URL/.test(error.message) && !error.message.includes('secret'));
});

test('repeated page cursors fail instead of looping indefinitely', async () => {
  const { instance } = client(() => ({ vertices: [{ id: 1, label: 'person' }], page: 'same' }));
  await assert.rejects(instance.collect('research', 'vertices', 100), /repeated pagination cursor/);
});

test('auto creation discovers scoped management even when graph listing is legacy', async () => {
  const { instance, requests } = client(({ url, method }) => {
    if (method === 'POST') return { name: 'new_graph', backend: 'rocksdb' };
    if (url.pathname.endsWith('/source')) return { name: 'source', backend: 'rocksdb' };
    if (url.pathname.includes('/graphspaces/')) return { status: 400, body: { message: 'GraphSpace management is not supported in standalone mode' } };
    return { graphs: ['source'] };
  }, { HUGEGRAPH_ALLOW_CREATE: 'true', HUGEGRAPH_API_MODE: 'auto', HUGEGRAPH_GRAPHSPACE: 'my space', HUGEGRAPH_URL: 'http://hugegraph:8080/gateway' });
  const result = await instance.createGraph('new_graph', 'source');
  assert.equal(instance.resolvedMode, '/graphs');
  assert.deepEqual(result, { name: 'new_graph', backend: 'rocksdb' });
  const writes = requests.filter(request => request.method === 'POST');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url.pathname, '/gateway/graphspaces/my%20space/graphs/new_graph');
  assert.equal(writes[0].headers['Content-Type'], 'application/json');
  assert.equal(writes[0].url.searchParams.get('clone_graph_name'), 'source');
});

test('auto creation falls back through read-only probes on older servers', async () => {
  const { instance, requests } = client(({ url, method }) => {
    if (url.pathname.startsWith('/graphspaces/')) return { status: 404 };
    if (method === 'POST') return { name: 'new_graph' };
    if (url.pathname === '/graphs/source') return { name: 'source', backend: 'rocksdb' };
    return { graphs: ['source'] };
  }, { HUGEGRAPH_ALLOW_CREATE: 'true', HUGEGRAPH_API_MODE: 'auto' });
  await instance.createGraph('new_graph', 'source');
  const writes = requests.filter(request => request.method === 'POST');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url.pathname, '/graphs/new_graph');
  assert.equal(writes[0].headers['Content-Type'], 'text/plain');
});

test('template authentication failures prevent creation without probing another API', async () => {
  const { instance, requests } = client(({ url }) => url.pathname.endsWith('/source') ? { status: 403 } : { graphs: ['source'] }, { HUGEGRAPH_ALLOW_CREATE: 'true', HUGEGRAPH_API_MODE: 'auto' });
  await assert.rejects(instance.createGraph('new_graph', 'source'), { status: 403 });
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  assert.equal(requests.filter(request => request.url.pathname === '/graphs/source').length, 0);
});

test('unsupported or unverifiable storage backends never receive a creation request', async () => {
  for (const details of [{ name: 'source', backend: 'cassandra' }, { name: 'source', backend: 'hstore' }, { graphs: ['source'] }]) {
    const { instance, requests } = client(({ url }) => url.pathname === '/graphs' ? { graphs: ['source'] } : details, { HUGEGRAPH_ALLOW_CREATE: 'true' });
    await assert.rejects(instance.createGraph('new_graph', 'source'), error => [400, 502].includes(error.status));
    assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  }
});

test('memory creation uses a separate store without applying RocksDB settings', async () => {
  const { instance, requests } = client(({ url, method }) => method === 'POST' ? { name: 'new_graph' } : url.pathname.endsWith('/source') ? { name: 'source', backend: 'memory' } : { graphs: ['source'] }, { HUGEGRAPH_ALLOW_CREATE: 'true', HUGEGRAPH_API_MODE: 'graphspace' });
  await instance.createGraph('new_graph', 'source');
  assert.deepEqual(JSON.parse(requests.find(request => request.method === 'POST').body), { store: 'new_graph' });
});

test('concurrent creation of one graph submits exactly one mutation', async () => {
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const { instance, requests } = client(async ({ url, method }) => {
    if (method === 'POST') { started.resolve(); await finish.promise; return { name: 'new_graph' }; }
    return url.pathname.endsWith('/source') ? { name: 'source', backend: 'rocksdb' } : { graphs: ['source'] };
  }, { HUGEGRAPH_ALLOW_CREATE: 'true' });
  const first = instance.createGraph('new_graph', 'source');
  await started.promise;
  try { await assert.rejects(instance.createGraph('new_graph', 'source'), { status: 409 }); }
  finally { finish.resolve(); }
  await first;
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
  assert.equal(instance.creating.size, 0);
});

test('uncertain creation outcomes require checking the graph list and never retry the mutation', async () => {
  for (const failure of ['timeout', 'body-read', 'server-error', 'wrong-result']) {
    const { instance, requests } = client(({ url, method }) => {
      if (method !== 'POST') return url.pathname.endsWith('/source') ? { name: 'source', backend: 'rocksdb' } : { graphs: ['source'] };
      if (failure === 'timeout') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      if (failure === 'server-error') return { status: 500, body: { message: 'Backend error after creating graph' } };
      return { name: 'unexpected_graph' };
    }, { HUGEGRAPH_ALLOW_CREATE: 'true' });
    if (failure === 'body-read') {
      const fetcher = instance.fetcher;
      instance.fetcher = async (url, options) => {
        const response = await fetcher(url, options);
        if (options.method === 'POST') response.text = async () => { throw new Error('Connection closed while reading response'); };
        return response;
      };
    }
    await assert.rejects(instance.createGraph('new_graph', 'source'), error => error.status === 502 && error.code === 'CREATION_UNCERTAIN' && /may already exist/.test(error.message));
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    assert.equal(instance.creating.size, 0);
  }
});

test('node lookup finds IDs, names, and properties across all node types', async () => {
  const { instance } = client(() => ({ vertices: [
    { id: 7, label: 'person', properties: { name: 'Ada' } },
    { id: 'node1', label: 'project', properties: { title: 'Engine', active: true } },
    { id: 'org1', label: 'institution', properties: { name: 'Cambridge', location: { city: 'London' } } },
  ], page: null }));
  for (const [value, expected] of [['7', 7], ['ada', 7], ['node1', 'node1'], ['engine', 'node1'], ['true', 'node1'], ['london', 'org1'], ['institution', 'org1']]) {
    const result = await instance.search('research', { value });
    assert.equal(result.vertices[0].id, expected);
  }
  assert.equal((await instance.search('research', { value: 'ad', exact: true })).vertices.length, 0);
});

test('incoming and outgoing connections include full endpoint nodes and preserve truncation', async () => {
  const { instance, requests } = client(({ url }) => {
    if (url.pathname.endsWith('/edges')) return { edges: [url.searchParams.get('direction') === 'OUT' ? { id: 'out', outV: 'node1', inV: 'node2', label: 'knows' } : { id: 'in', outV: 'node3', inV: 'node1', label: 'manages' }], page: 'more' };
    return { id: JSON.parse(decodeURIComponent(url.pathname.split('/').at(-1))), label: 'person' };
  }, { HUGEGRAPH_MAX_ELEMENTS: '1' });
  for (const direction of ['OUT', 'IN']) {
    const result = await instance.neighbors('research', 'node1', direction);
    assert.equal(result.vertices.length, 2);
    assert.equal(result.edges[0].id, direction === 'OUT' ? 'out' : 'in');
    assert.equal(result.truncated, true);
    assert.equal(result.limit, 1);
  }
  assert.equal(requests.filter(request => request.url.pathname.endsWith('/edges')).length, 2);
  await assert.rejects(instance.neighbors('research', 'node1', 'INVALID'), { status: 400 });
});

test('isolated node lookup keeps the node in the connection view', async () => {
  const { instance } = client(({ url }) => url.pathname.endsWith('/edges') ? { edges: [], page: null } : { id: 'isolated', label: 'person', properties: { name: 'Alone' } });
  const result = await instance.neighbors('research', 'isolated');
  assert.equal(result.vertices[0].id, 'isolated');
  assert.deepEqual(result.edges, []);
  assert.equal(result.truncated, false);
});

test('interrupted upstream response bodies produce a connection error without leaking details', async () => {
  const instance = new HugeGraphClient(readConfig({ HUGEGRAPH_API_MODE: 'legacy' }), async () => ({
    text: async () => { throw new Error('Connection closed: secret'); },
  }));
  await assert.rejects(instance.graphs(), error => error.status === 502 && error.code === 'UPSTREAM_UNAVAILABLE' && !error.message.includes('secret'));
});

test('timeouts while reading the response body remain timeout errors', async () => {
  const instance = new HugeGraphClient(readConfig({ HUGEGRAPH_API_MODE: 'legacy', HUGEGRAPH_TIMEOUT_MS: '1' }), async (url, { signal }) => ({
    text: async () => {
      await new Promise(resolve => setTimeout(resolve, 15));
      assert.equal(signal.aborted, true);
      throw new DOMException('The operation was aborted.', 'AbortError');
    },
  }));
  await assert.rejects(instance.graphs(), { status: 502, code: 'UPSTREAM_TIMEOUT' });
});

test('malformed pages and cursors fail with a useful upstream response error', async () => {
  for (const body of [null, [], {}, { vertices: null }, { vertices: [], page: 123 }, { vertices: [], page: {} }, { vertices: [{ id: 1 }, { id: 2 }] }]) {
    const instance = new HugeGraphClient(readConfig({ HUGEGRAPH_API_MODE: 'legacy' }), async () => Response.json(body));
    await assert.rejects(instance.page('research', 'vertices', { limit: 1 }), { status: 502, code: 'INVALID_API_RESPONSE' });
  }
});

test('collection follows empty pages with a next cursor', async () => {
  const { instance, requests } = client(({ url }) => url.searchParams.get('page')
    ? { vertices: [{ id: 'found', label: 'person' }], page: null }
    : { vertices: [], page: 'next' });
  const result = await instance.collect('research', 'vertices', 2);
  assert.deepEqual(result.items, [{ id: 'found', label: 'person' }]);
  assert.equal(result.truncated, false);
  assert.equal(requests.length, 2);
});

test('property search only reads properties stored on the vertex', async () => {
  const { instance } = client(() => ({ vertices: [{ id: 1, label: 'person', properties: {} }], page: null }));
  for (const [property, value] of [['__proto__', '{}'], ['constructor', 'function Object']]) {
    const result = await instance.search('research', { property, value });
    assert.equal(result.totalMatches, 0);
  }
});

test('invalid URL suffixes and embedded credentials fail during configuration', () => {
  for (const suffix of ['?token=test', '#graphs', '?', '#']) {
    assert.throws(() => readConfig({ HUGEGRAPH_URL: `http://hugegraph:8080/gateway${suffix}` }), /query string or fragment/);
  }
  assert.throws(() => readConfig({ HUGEGRAPH_URL: 'http://user:password@hugegraph:8080' }), /HUGEGRAPH_USERNAME/);
  assert.equal(readConfig({ HUGEGRAPH_URL: 'http://hugegraph:8080/gateway/' }).url, 'http://hugegraph:8080/gateway');
  assert.equal(readConfig({ HUGEGRAPH_URL: 'http://hugegraph:8080/gateway///' }).url, 'http://hugegraph:8080/gateway');
});

test('malformed graph records fail before reaching search, tables, or the canvas', async () => {
  const vertex = { id: 7, label: 'person', properties: { name: 'Ada' } };
  const invalidVertices = [null, [], 'node', {}, { ...vertex, id: null }, { ...vertex, id: {} }, { ...vertex, id: 1.5 }, { ...vertex, id: Number.MAX_SAFE_INTEGER + 1 }, { ...vertex, label: null }, { ...vertex, properties: [] }, { ...vertex, properties: 'name=Ada' }];
  const edge = { id: 'e1', label: 'knows', outV: 7, inV: '7', properties: {} };
  const invalidEdges = [null, { ...edge, outV: null }, { ...edge, inV: {} }, { ...edge, inV: Number.MAX_SAFE_INTEGER + 1 }, { ...edge, label: [] }];
  for (const [kind, records] of [['vertices', invalidVertices], ['edges', invalidEdges]]) {
    for (const record of records) {
      const { instance } = client(() => ({ [kind]: [record], page: null }));
      await assert.rejects(instance.page('research', kind), { status: 502, code: 'INVALID_API_RESPONSE' });
    }
  }
  const { instance } = client(({ url }) => ({ [url.pathname.endsWith('/vertices') ? 'vertices' : 'edges']: [url.pathname.endsWith('/vertices') ? vertex : edge], page: null }));
  assert.deepEqual((await instance.page('research', 'vertices')).items, [vertex]);
  assert.deepEqual((await instance.page('research', 'edges')).items, [edge]);
});

test('neighborhood endpoint responses must contain the requested vertex with its original ID type', async () => {
  for (const vertex of [null, {}, { id: '7', label: 'person' }, { id: 8, label: 'person' }, { id: 7, label: 'person', properties: [] }]) {
    const instance = new HugeGraphClient(readConfig({ HUGEGRAPH_API_MODE: 'legacy' }), async url => Response.json(new URL(url).pathname.endsWith('/edges') ? { edges: [], page: null } : vertex));
    await assert.rejects(instance.neighbors('research', 7), { status: 502, code: 'INVALID_API_RESPONSE' });
  }
});
