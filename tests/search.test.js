import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createSearchRequests, findVertices } from '../src/search.js';

// Load JSX through the project's existing tooling without a browser or socket.
const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, ws: false, watch: null }, appType: 'custom' });
let SearchPanel, SearchResults;
try { ({ default: SearchPanel, SearchResults } = await vite.ssrLoadModule('/src/SearchPanel.jsx')); }
finally { await vite.close(); }

const vertices = [
  { id: 7, label: 'student', properties: { name: 'Ada', city: 'London' } },
  { id: '7', label: 'lecturer', properties: { name: 'Alan', active: true } },
  { id: 'course/1', label: 'course', properties: { title: 'Computer Networks' } },
];
const result = (matches = vertices, extra = {}) => ({ vertices: matches, totalMatches: matches.length, scanned: vertices.length, truncated: false, resultsLimited: false, ...extra });

test('live vertex search preserves special characters, exact matching, and cancellation signal', async t => {
  const signal = new AbortController().signal;
  const response = result([vertices[0]]);
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    const url = new URL(path, 'http://portal');
    assert.equal(url.pathname, '/api/graphs/school%2Fone/search');
    assert.equal(url.searchParams.get('value'), 'Ada & London/#');
    assert.equal(url.searchParams.get('exact'), 'true');
    assert.equal(options.signal, signal);
    return Response.json(response);
  });
  assert.deepEqual(await findVertices({ graph: 'school/one', mode: 'live', query: 'Ada & London/#', exact: true, signal }), response);
});

test('demo vertex search finds IDs, labels, names, and properties across types', async () => {
  for (const [query, exact, expected] of [
    ['aD', false, [7]], ['ADA', true, [7]], ['Ad', true, []],
    ['7', true, [7, '7']], ['lecturer', true, ['7']],
    ['London', true, [7]], ['true', true, ['7']], ['networks', false, ['course/1']],
  ]) {
    const response = await findVertices({ mode: 'demo', initialData: { vertices }, query, exact });
    assert.deepEqual(response.vertices.map(vertex => vertex.id), expected);
    assert.equal(response.truncated, false);
  }
});

test('search keeps result limits explicit and preserves scan truncation', async t => {
  const all = Array.from({ length: 101 }, (_, i) => ({ id: i, label: 'student' }));
  const demo = await findVertices({ mode: 'demo', initialData: { vertices: all }, query: 'student', exact: true });
  assert.equal(demo.vertices.length, 100);
  assert.equal(demo.totalMatches, 101);
  assert.equal(demo.resultsLimited, true);
  const partial = result([vertices[0]], { truncated: true });
  t.mock.method(globalThis, 'fetch', async () => Response.json(partial));
  assert.deepEqual(await findVertices({ graph: 'school', mode: 'live', query: 'Ada', exact: false }), partial);
});

test('invalid search payloads fail before they can enter component state', async t => {
  for (const response of [
    {}, { vertices: [] }, result([], { vertices: null }), result([], { scanned: null }),
    result([], { scanned: -1 }), result([], { totalMatches: '0' }),
    result([], { truncated: 'false' }), result([], { resultsLimited: null }),
    result([null]), result([{ id: {}, label: 'student' }]),
    result([{ id: 9007199254740992, label: 'student' }]),
    result([{ id: 'x' }]), result([{ id: 'x', label: 'student', properties: [] }]),
    result([vertices[0]], { totalMatches: 0 }),
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(response));
    await assert.rejects(findVertices({ graph: 'school', mode: 'live', query: 'Ada', exact: false }), { code: 'INVALID_API_RESPONSE' });
    mock.mock.restore();
  }
});

test('a superseded search stays invalid even when its response arrives after the replacement', async t => {
  const responses = [];
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => responses.push(resolve)));
  const requests = createSearchRequests();
  const first = requests.start();
  const oldSearch = findVertices({ graph: 'school', mode: 'live', query: 'Ada', exact: true, signal: first.signal });
  const second = requests.start();
  const newSearch = findVertices({ graph: 'school', mode: 'live', query: 'Alan', exact: true, signal: second.signal });
  responses[1](Response.json(result([vertices[1]])));
  assert.equal((await newSearch).vertices[0].id, '7');
  responses[0](Response.json(result([vertices[0]])));
  await oldSearch;
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  requests.cancel();
});

test('editing, resetting, or unmounting can cancel a search and accept a new one', () => {
  const requests = createSearchRequests();
  const first = requests.start();
  requests.cancel();
  requests.cancel();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  const next = requests.start();
  assert.equal(next.signal.aborted, false);
  assert.equal(next.isCurrent(), true);
  requests.cancel();
});

test('populated search results render names and typed ID keys without crashing', () => {
  const html = renderToStaticMarkup(createElement(SearchResults, { results: result(), onFocus() {}, focusing: false }));
  assert.match(html, /3 matching nodes/);
  for (const name of ['Ada', 'Alan', 'Computer Networks']) assert.ok(html.includes(name));
  const tree = SearchResults({ results: result(), onFocus() {}, focusing: false });
  const buttons = tree.props.children.at(-1);
  assert.notEqual(buttons[0].key, buttons[1].key, 'Numeric and string IDs need distinct keys');
});

test('selecting a search result always requests both relationship directions', () => {
  const calls = [];
  const tree = SearchResults({ results: result(), onFocus: (...args) => calls.push(args), focusing: false });
  const buttons = tree.props.children.at(-1);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(calls, vertices.map(vertex => [vertex, 'BOTH']));
  const loading = SearchResults({ results: result(), onFocus() {}, focusing: true });
  assert.ok(loading.props.children.at(-1).every(button => button.props.disabled));
});

test('empty and limited results show the correct guidance and the initial form renders', () => {
  const html = renderToStaticMarkup(createElement(SearchResults, { results: result([], { truncated: true, resultsLimited: true }), onFocus() {} }));
  assert.match(html, /No nodes matched in the scanned records/);
  assert.match(html, /More matches may exist/);
  assert.match(html, /Showing the first 100 matches/);
  const form = renderToStaticMarkup(createElement(SearchPanel, { graph: 'school', mode: 'demo', initialData: { vertices }, onFocus() {}, onReset() {} }));
  assert.match(form, /Find connections/);
  assert.match(form, /Exact match/);
});
