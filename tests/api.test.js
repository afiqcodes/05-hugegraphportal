import test from 'node:test';
import assert from 'node:assert/strict';
import { api, createGraph } from '../src/api.js';

test('API requests preserve paths, options, and structured server errors', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/graphs');
    assert.equal(options.headers.get('Content-Type'), 'application/json');
    assert.equal(options.headers.get('X-Test'), 'test');
    assert.equal(options.method, 'POST');
    return Response.json({ message: 'Check the graph list.', code: 'CREATION_UNCERTAIN' }, { status: 502 });
  });
  await assert.rejects(api('/graphs', { method: 'POST', headers: { 'X-Test': 'test' } }), {
    message: 'Check the graph list.', status: 502, code: 'CREATION_UNCERTAIN',
  });
});

test('API headers support all fetch formats and override defaults without duplicate values', async t => {
  for (const headers of [
    { 'content-type': 'text/plain', 'X-Test': 'kept' },
    new Headers({ 'Content-Type': 'text/plain', 'X-Test': 'kept' }),
    [['content-type', 'text/plain'], ['X-Test', 'kept']],
  ]) {
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(options.headers.get('content-type'), 'text/plain');
      assert.equal(options.headers.get('x-test'), 'kept');
      return Response.json({ graphs: [] });
    });
    await api('/graphs', { headers });
    fetchMock.mock.restore();
  }
});

test('successful API responses must contain a JSON object', async t => {
  for (const body of ['<html>Proxy error</html>', '', 'null', 'true', '42', '"text"', '[]']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body));
    await assert.rejects(api('/graphs'), error => error.code === 'INVALID_API_RESPONSE' && !error.status);
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ graphs: [] }));
  assert.deepEqual(await api('/graphs'), { graphs: [] });
});

test('non-JSON and null error responses retain the HTTP status', async t => {
  for (const body of ['null', '<html>Bad gateway</html>']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 502 }));
    await assert.rejects(api('/graphs'), { message: 'Request failed (502)', status: 502 });
  }
});

test('creation confirms the graph name and never retries an uncertain response', async t => {
  for (const result of [{}, { name: 'other_graph' }, { name: null }]) {
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, '/api/graphs');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { name: 'new_graph', template: 'source' });
      return Response.json(result);
    });
    await assert.rejects(createGraph('new_graph', 'source'), { code: 'CREATION_UNCERTAIN' });
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ name: 'new_graph', backend: 'memory' }));
  assert.deepEqual(await createGraph('new_graph', 'source'), { name: 'new_graph', backend: 'memory' });
});

test('an interrupted successful response cannot report graph creation success', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => { throw new Error('Connection closed while reading response'); },
  }));
  await assert.rejects(createGraph('new_graph', 'source'), error => error.code === 'INVALID_API_RESPONSE' && !error.status);
});
