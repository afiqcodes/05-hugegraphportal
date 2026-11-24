import test from 'node:test';
import assert from 'node:assert/strict';
import { demoGraphs, demoSnapshot } from '../src/demo.js';

test('demo graph counts describe their snapshots and all edge endpoints are present', () => {
  for (const graph of demoGraphs) {
    const snapshot = demoSnapshot(graph.name);
    const ids = new Set(snapshot.vertices.map(vertex => vertex.id));
    assert.equal(snapshot.vertices.length, graph.vertices);
    assert.equal(snapshot.edges.length, graph.edges);
    assert.ok(snapshot.edges.every(edge => ids.has(edge.outV) && ids.has(edge.inV)));
  }
  assert.throws(() => demoSnapshot('missing_graph'), /not part of the demo/);
});
