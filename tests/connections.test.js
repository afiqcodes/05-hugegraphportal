import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionsFor } from '../src/connections.js';

test('node connections preserve direction, relationship properties, parallel edges, loops, and typed IDs', () => {
  const node = { id: 7, label: 'person', properties: { name: 'Ada' } };
  const numericTwin = { id: '7', label: 'person', properties: { name: 'Alan' } };
  const project = { id: 'project:1', label: 'project', properties: { name: 'Engine' } };
  const data = {
    vertices: [node, numericTwin, project],
    edges: [
      { id: 'a', outV: 7, inV: 'project:1', label: 'built', properties: { year: 1843 } },
      { id: 'b', outV: 7, inV: 'project:1', label: 'designed' },
      { id: 'c', outV: '7', inV: 7, label: 'knows' },
      { id: 'd', outV: 7, inV: 7, label: 'references' },
      { id: 'unrelated', outV: '7', inV: 'project:1', label: 'uses' },
    ],
  };
  const relationships = connectionsFor(data, node);
  assert.equal(relationships.length, 4);
  assert.deepEqual(relationships.map(item => item.direction), ['Outgoing', 'Outgoing', 'Incoming', 'Self relationship']);
  assert.equal(relationships[0].source, node);
  assert.equal(relationships[0].target, project);
  assert.equal(relationships[0].edge.properties.year, 1843);
  assert.equal(relationships[2].source, numericTwin);
  assert.equal(relationships[2].target, node);
  assert.equal(relationships[2].other, numericTwin);
  assert.equal(relationships[3].other, node);
  const neighbors = new Set(relationships.filter(item => JSON.stringify(item.otherId) !== JSON.stringify(node.id)).map(item => JSON.stringify(item.otherId)));
  assert.equal(neighbors.size, 2);
});

test('an isolated node has no connections and missing endpoints retain their IDs', () => {
  const node = { id: 'isolated' };
  assert.deepEqual(connectionsFor({ vertices: [node], edges: [] }, node), []);
  const [connection] = connectionsFor({ vertices: [node], edges: [{ id: 'edge', outV: 'missing', inV: node.id, label: 'linked_to' }] }, node);
  assert.equal(connection.source, undefined);
  assert.equal(connection.otherId, 'missing');
  assert.equal(connection.target, node);
});
