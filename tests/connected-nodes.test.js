import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { connectionGroups, loadConnections } from '../src/connections.js';

const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, ws: false, watch: null }, appType: 'custom' });
after(() => vite.close());
const { default: ConnectionsPanel, ConnectedNodesDetails, ConnectedNodeCard } = await vite.ssrLoadModule('/src/ConnectionsPanel.jsx');
const { default: App, Dashboard } = await vite.ssrLoadModule('/src/App.jsx');
await vite.ssrLoadModule('/src/GraphCanvas.jsx');

function findElement(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (Array.isArray(element)) return element.map(child => findElement(child, predicate)).find(Boolean);
  if (predicate(element)) return element;
  return findElement(element.props?.children, predicate);
}

const node = { id: 7, label: 'student', properties: { name: 'Ada' } };
const twin = { id: '7', label: 'lecturer', properties: { name: 'Alan' } };
const course = { id: 'course/1', label: 'course', properties: { title: 'Network Security', code: 'SEC101' } };
const data = { vertices: [node, twin, course], edges: [
  { id: 'a', outV: 7, inV: 'course/1', label: 'studies', properties: { semester: 2 } },
  { id: 'b', outV: 7, inV: 'course/1', label: 'assists' },
  { id: 'c', outV: '7', inV: 7, label: 'advises' },
  { id: 'd', outV: 7, inV: 7, label: 'references' },
  { id: 'unrelated', outV: '7', inV: 'course/1', label: 'teaches' },
], truncated: false };

test('connected node groups retain parallel relationships, direction, and self-links', () => {
  const groups = connectionGroups(data, node);
  assert.deepEqual(groups.map(group => group.id), ['course/1', '7', 7]);
  assert.deepEqual(groups[0].relationships.map(item => item.edge.id), ['a', 'b']);
  assert.equal(groups[1].node, twin);
  assert.equal(groups[1].relationships[0].direction, 'Incoming');
  assert.equal(groups[2].relationships[0].direction, 'Self relationship');
  assert.equal(groups.flatMap(group => group.relationships).length, 4);
});

test('live connection loads retain typed IDs, directions, abort signals, and bounded results', async t => {
  const signal = new AbortController().signal;
  for (const selected of [node, twin]) {
    const mock = t.mock.method(globalThis, 'fetch', async (path, options) => {
      const url = new URL(path, 'http://portal');
      assert.equal(url.pathname, '/api/graphs/school%2Fone/neighbors');
      assert.equal(JSON.parse(url.searchParams.get('id')), selected.id);
      assert.equal(url.searchParams.get('direction'), 'IN');
      assert.equal(options.signal, signal);
      return Response.json({ ...data, truncated: true, limit: 100 });
    });
    const loaded = await loadConnections({ graph: 'school/one', mode: 'live', id: selected.id, direction: 'IN', signal });
    assert.equal(loaded.truncated, true);
    assert.equal(loaded.limit, 100);
    mock.mock.restore();
  }
});

test('demo connection loads honor all directions and reject missing nodes', async () => {
  for (const direction of ['BOTH', 'IN', 'OUT']) {
    const loaded = await loadConnections({ graph: 'research_network', mode: 'demo', id: 'person:alan', direction });
    assert.ok(loaded.vertices.some(vertex => vertex.id === 'person:alan'));
    assert.ok(loaded.edges.length);
    assert.ok(loaded.edges.every(edge => direction === 'BOTH' ? edge.outV === 'person:alan' || edge.inV === 'person:alan' : direction === 'IN' ? edge.inV === 'person:alan' : edge.outV === 'person:alan'));
  }
  await assert.rejects(loadConnections({ graph: 'research_network', mode: 'demo', id: 'missing' }), /no longer available/);
});

test('connection loaders reject malformed details and preserve server errors', async t => {
  for (const payload of [{}, { ...data, vertices: null }, { ...data, edges: null }, { ...data, truncated: null }, { ...data, vertices: [{ id: 7 }] }, { ...data, edges: [{ id: 'edge', label: 'knows' }] }, { ...data, vertices: [twin] }]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
    await assert.rejects(loadConnections({ graph: 'school', mode: 'live', id: 7 }), /invalid connection details|no longer available/);
    mock.mock.restore();
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Node was deleted.' }, { status: 404 }));
  await assert.rejects(loadConnections({ graph: 'school', mode: 'live', id: 7 }), { message: 'Node was deleted.', status: 404 });
});

test('full-width connection card renders selected and connected node properties and relationships', () => {
  const html = renderToStaticMarkup(createElement(ConnectionsPanel, { node, data, ready: true, direction: 'BOTH', onFocus() {}, onDirection() {}, onClose() {} }));
  assert.match(html, /Connected Nodes/);
  assert.match(html, /Connections for Ada/);
  assert.match(html, /2 connected nodes · 4 relationships/);
  assert.equal([...html.matchAll(/class="panel connected-node-card"/g)].length, 3);
  for (const text of ['Selected node properties', 'Network Security', 'SEC101', 'Node properties', 'Relationship details', 'studies', 'assists', 'advises', 'semester', 'Incoming', 'Outgoing', 'Self relationship']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('teaches'));
  assert.ok(!html.includes('href='), 'Connection details must stay on the current dashboard');
});

test('connection card handles no selection, loading, and a failed connection request', () => {
  const empty = renderToStaticMarkup(createElement(ConnectionsPanel, { node: null, data }));
  assert.match(empty, /Find a node to see its connections/);
  const loading = renderToStaticMarkup(createElement(ConnectionsPanel, { node, data, loading: true, ready: false }));
  assert.match(loading, /Loading connected nodes/);
  assert.ok(!loading.includes('Network Security'), 'Previous connection details must not show while loading');
  const error = renderToStaticMarkup(createElement(ConnectionsPanel, { node, data, loading: false, ready: false, error: 'Node was deleted.' }));
  assert.match(error, /Node was deleted/);
  assert.match(error, /Retry connections/);
  assert.ok(!error.includes('Network Security'));
});

test('direction, refresh, retry, and clear controls act on the current selection', () => {
  const calls = [];
  const props = { node, data, direction: 'IN', ready: true, onDirection: next => calls.push(['direction', next]), onFocus: (...args) => calls.push(['focus', ...args]), onClose: () => calls.push(['clear']) };
  const tree = ConnectionsPanel(props);
  findElement(tree, element => element.type === 'select').props.onChange({ target: { value: 'OUT' } });
  findElement(tree, element => element.props?.['aria-label'] === 'Refresh connected nodes').props.onClick();
  findElement(tree, element => element.props?.['aria-label'] === 'Clear connected nodes').props.onClick();
  const failed = ConnectionsPanel({ ...props, ready: false });
  const retry = findElement(failed, element => element.type === 'button' && element.props.className === 'button secondary');
  retry.props.onClick();
  assert.deepEqual(calls, [['direction', 'OUT'], ['focus', node, 'IN'], ['clear'], ['focus', node, 'IN']]);
  const busy = ConnectionsPanel({ ...props, loading: true, ready: false });
  assert.equal(findElement(busy, element => element.type === 'select').props.disabled, true);
});

test('following a connected node updates the current dashboard with both directions', () => {
  const calls = [];
  const group = connectionGroups(data, node)[0];
  const card = ConnectedNodeCard({ group, node, onFocus: (...args) => calls.push(args) });
  const button = findElement(card, element => element.type === 'button' && element.props.className.includes('connected-node-follow'));
  button.props.onClick();
  assert.deepEqual(calls, [[course, 'BOTH']]);
  assert.ok(!findElement(card, element => element.type === 'a'));
});

test('details show isolated and filtered empty states plus truncated-count warnings', () => {
  for (const direction of ['BOTH', 'IN', 'OUT']) {
    const html = renderToStaticMarkup(createElement(ConnectedNodesDetails, { node, data: { vertices: [node], edges: [], truncated: false }, direction }));
    assert.match(html, /0 connected nodes · 0 relationships/);
    assert.ok(html.includes(direction === 'BOTH' ? 'This node has no relationships.' : 'Choose All directions'));
  }
  const limited = renderToStaticMarkup(createElement(ConnectedNodesDetails, { node, data: { ...data, truncated: true, limit: 100 }, direction: 'BOTH' }));
  assert.match(limited, /loaded connections only/);
  assert.match(limited, /limit: 100/);
});

test('connection card paginates connected node groups at twelve cards', () => {
  const neighbors = Array.from({ length: 13 }, (_, i) => ({ id: `neighbor:${i}`, label: 'person', properties: { name: `Neighbor ${i}` } }));
  const loaded = { vertices: [node, ...neighbors], edges: neighbors.map(vertex => ({ id: `edge:${vertex.id}`, label: 'knows', outV: node.id, inV: vertex.id })), truncated: false };
  const html = renderToStaticMarkup(createElement(ConnectedNodesDetails, { node, data: loaded, direction: 'BOTH' }));
  assert.equal([...html.matchAll(/class="panel connected-node-card"/g)].length, 12);
  assert.match(html, /Showing 1–12 of 13 node cards/);
  assert.ok(!html.includes('Neighbor 12'));
});

test('dashboard places the Connected Nodes card after the graph and search row', () => {
  const html = renderToStaticMarkup(createElement(Dashboard, { graph: 'school', initialData: data, mode: 'live', onRefresh() {} }));
  assert.match(html, /<\/aside><\/div><section class="panel connections-panel"/);
  assert.ok(html.indexOf('class="explorer-layout"') < html.indexOf('class="panel connections-panel"'));
  assert.ok(html.indexOf('class="explorer-sidebar"') < html.indexOf('class="panel connections-panel"'));
  assert.match(html, /Find a node to see its connections/);
});

test('workspace navigation no longer has a separate Connected Nodes page', t => {
  const globals = { window: { location: { hash: '#/graphs/school/dashboard' } }, localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null } };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => { for (const key of Object.keys(globals)) { if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else delete globalThis[key]; } });
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /title="Dashboard" aria-current="page"/);
  assert.ok(!html.includes('/connected-nodes'));
  assert.ok(!html.includes('title="Connected Nodes"'));
});
