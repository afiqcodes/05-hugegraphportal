import test from 'node:test';
import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { createApp } from '../server/app.js';
import { ApiError } from '../server/hugegraph.js';

// Exercise Express routing and middleware without opening a local port.
function request(app, url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = new IncomingMessage(new PassThrough());
    req.method = method;
    req.url = url;
    req.headers = body === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) };
    const res = new ServerResponse(req);
    res.end = data => {
      try { resolve({ status: res.statusCode, headers: res.getHeaders(), body: JSON.parse(String(data)) }); }
      catch (error) { reject(error); }
      return res;
    };
    app.handle(req, res);
    if (body !== undefined) req.push(body);
    req.push(null);
  });
}

test('pagination preserves opaque cursors and rejects repeated or invalid parameters before upstream reads', async t => {
  const page = t.mock.fn(async () => ({ items: [], nextPage: null }));
  const app = createApp({ page });
  const result = await request(app, '/api/graphs/my%20graph/vertices?page=next%2B%2F%3D&limit=25');
  assert.equal(result.status, 200);
  assert.deepEqual(page.mock.calls[0].arguments, ['my graph', 'vertices', { page: 'next+/=', limit: 25 }]);
  for (const query of ['limit=25&limit=25', 'page=a&page=b', 'limit=', 'limit=0', 'limit=501', 'limit=1.5', 'limit=no']) {
    assert.equal((await request(app, `/api/graphs/research/vertices?${query}`)).status, 400, query);
  }
  assert.equal(page.mock.callCount(), 1);
  assert.equal((await request(app, '/api/graphs/research/unknown')).status, 404);
});

test('search validates scalar parameters and exact matching without changing search text', async t => {
  const search = t.mock.fn(async () => ({ vertices: [] }));
  const app = createApp({ search });
  assert.equal((await request(app, '/api/graphs/research/search?value=%20Ada%20&exact=true')).status, 200);
  assert.deepEqual(search.mock.calls[0].arguments, ['research', { property: '', value: ' Ada ', label: '', exact: true }]);
  for (const query of ['value=%20%20', 'value=a&value=b', 'value=Ada&property=a&property=b', 'label=person&label=project', 'value=Ada&exact=true&exact=false', 'value=Ada&exact=yes']) {
    assert.equal((await request(app, `/api/graphs/research/search?${query}`)).status, 400, query);
  }
  assert.equal(search.mock.callCount(), 1);
});

test('neighborhood routes preserve typed IDs and validate directions', async t => {
  const neighbors = t.mock.fn(async () => ({ vertices: [], edges: [] }));
  const app = createApp({ neighbors });
  for (const id of [7, '7', 'a/b']) {
    const params = new URLSearchParams({ id: JSON.stringify(id), direction: 'IN' });
    assert.equal((await request(app, `/api/graphs/research/neighbors?${params}`)).status, 200);
    assert.deepEqual(neighbors.mock.calls.at(-1).arguments, ['research', id, 'IN']);
  }
  for (const query of ['id=7&direction=', 'id=7&direction=SIDEWAYS', 'id=7&direction=IN&direction=OUT', 'id=7&id=8', 'id=null', 'id={}', 'id=1.5', 'id=9007199254740992']) {
    assert.equal((await request(app, `/api/graphs/research/neighbors?${query}`)).status, 400, query);
  }
  assert.equal(neighbors.mock.callCount(), 3);
});

test('API errors keep their status and code while unexpected errors stay private', async () => {
  for (const error of [new ApiError(502, 'Check graph list.', 'CREATION_UNCERTAIN'), new Error('private details')]) {
    const app = createApp({ graphs: async () => { throw error; } });
    const response = await request(app, '/api/graphs');
    assert.equal(response.status, error.status || 500);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.message, error.status ? error.message : 'The portal encountered an unexpected error.');
    assert.equal(response.body.code, error.code);
  }
});

test('malformed JSON returns an uncached API error before attempting graph creation', async t => {
  const createGraph = t.mock.fn();
  const response = await request(createApp({ createGraph }), '/api/graphs', { method: 'POST', body: '{' });
  assert.equal(response.status, 400);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(typeof response.body.message, 'string');
  assert.equal(createGraph.mock.callCount(), 0);
});
