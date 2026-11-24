import test from 'node:test';
import assert from 'node:assert/strict';
import cytoscape from 'cytoscape';
import { graphLayout, spaceNodeLabels } from '../src/graphLayout.js';
import { demoGraphs, demoSnapshot } from '../src/demo.js';

const box = (x, y, left = -60, right = 60, top = -24, bottom = 70) => ({
  position: { x, y }, bounds: { x1: x + left, x2: x + right, y1: y + top, y2: y + bottom },
});

function assertSeparated(nodes, positions, gap = 16) {
  const bounds = nodes.map((node, i) => {
    const dx = positions[i].x - node.position.x, dy = positions[i].y - node.position.y;
    assert.ok(Number.isFinite(positions[i].x) && Number.isFinite(positions[i].y));
    return { x1: node.bounds.x1 + dx, x2: node.bounds.x2 + dx, y1: node.bounds.y1 + dy, y2: node.bounds.y2 + dy };
  });
  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i], b = bounds[j];
      const horizontalGap = Math.max(b.x1 - a.x2, a.x1 - b.x2);
      const verticalGap = Math.max(b.y1 - a.y2, a.y1 - b.y2);
      assert.ok(Math.max(horizontalGap, verticalGap) >= gap - 1e-8, `Labels ${i} and ${j} overlap or lack clearance`);
    }
  }
}

test('spacing separates wide, wrapped labels and labels below neighboring nodes', () => {
  const fixtures = [
    [box(0, 0), box(50, 0), box(25, 45)],
    [box(100, 100), box(100, 150), box(100, 200)],
    [box(0, 0, -80, 80, -24, 100), box(-30, -50), box(-60, 20)],
    [box(-20, -20), box(30, 30), box(80, -20), box(30, -70)],
  ];
  for (const nodes of fixtures) {
    const original = structuredClone(nodes);
    assertSeparated(nodes, spaceNodeLabels(nodes));
    assert.deepEqual(nodes, original, 'Spacing must not mutate measured bounds');
  }
});

test('spacing handles coincident centers, empty graphs, and single nodes', () => {
  const nodes = [box(0, 0), box(0, 0), box(0, 0)];
  assertSeparated(nodes, spaceNodeLabels(nodes));
  assert.deepEqual(spaceNodeLabels([]), []);
  assert.deepEqual(spaceNodeLabels([box(30, 40)]), [{ x: 30, y: 40 }]);
});

test('spacing preserves positions when label boxes already have enough room', () => {
  const nodes = [box(0, 0), box(300, 0), box(0, 300)];
  assert.deepEqual(spaceNodeLabels(nodes), nodes.map(node => node.position));
});

test('shared layout completes initial and repeated layouts for every demo graph', () => {
  for (const graph of demoGraphs) {
    const data = demoSnapshot(graph.name);
    const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' }, elements: [
      ...data.vertices.map(vertex => ({ data: { id: vertex.id } })),
      ...data.edges.map(edge => ({ data: { id: edge.id, source: edge.outV, target: edge.inV } })),
    ] });
    try {
      for (let run = 0; run < 2; run++) {
        cy.layout({ ...graphLayout, boundingBox: { x1: 0, y1: 0, w: 1000, h: 620 } }).run();
        const nodes = cy.nodes().map(node => ({ position: node.position(), bounds: node.boundingBox({ includeOverlays: false, includeUnderlays: false }) }));
        assertSeparated(nodes, nodes.map(node => node.position));
      }
    } finally { cy.destroy(); }
  }
});
