// Expand the layout only as far as needed to separate node bodies and labels.
// Labels below a node are asymmetric, so retain each side's actual offset.
export function spaceNodeLabels(nodes, gap = 16) {
  const occupied = new Set();
  const boxes = nodes.map(({ position, bounds }) => {
    let { x, y } = position;
    // CoSE normally separates centers; also handle coincident input safely.
    while (occupied.has(`${x}:${y}`)) x += gap;
    occupied.add(`${x}:${y}`);
    return { x, y, left: bounds.x1 - position.x, right: bounds.x2 - position.x, top: bounds.y1 - position.y, bottom: bounds.y2 - position.y };
  });
  let scale = 1;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const horizontal = dx === 0 ? Infinity : (dx > 0 ? a.right - b.left + gap : b.right - a.left + gap) / Math.abs(dx);
      const vertical = dy === 0 ? Infinity : (dy > 0 ? a.bottom - b.top + gap : b.bottom - a.top + gap) / Math.abs(dy);
      // Separation on either axis is sufficient; preserve relative positions.
      scale = Math.max(scale, Math.min(horizontal, vertical));
    }
  }
  return boxes.map(({ x, y }) => ({ x: x * scale, y: y * scale }));
}

// Shared by first load and the Rearrange button.
export const graphLayout = {
  name: 'cose',
  animate: false,
  randomize: true,
  nodeDimensionsIncludeLabels: true,
  fit: false,
  componentSpacing: 150,
  nodeRepulsion: () => 45000,
  nodeOverlap: 20,
  idealEdgeLength: () => 180,
  edgeElasticity: () => 100,
  gravity: .2,
  stop: ({ cy }) => {
    const nodes = cy.nodes();
    const positions = spaceNodeLabels(nodes.map(node => ({
      position: node.position(),
      bounds: node.boundingBox({ includeLabels: true, includeOverlays: false, includeUnderlays: false }),
    })));
    nodes.positions((node, index) => positions[index]);
    cy.fit(undefined, 70);
  },
};
