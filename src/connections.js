import { api, elementKey, graphUrl } from './api.js';
import { demoSnapshot } from './demo.js';

export async function loadConnections({ graph, mode, id, direction = 'BOTH', signal }) {
  if (!['BOTH', 'IN', 'OUT'].includes(direction)) throw new Error('Choose all, incoming, or outgoing relationships.');
  let data;
  if (mode === 'demo') {
    const all = demoSnapshot(graph);
    const key = elementKey(id);
    const edges = all.edges.filter(edge => (direction !== 'IN' && elementKey(edge.outV) === key) || (direction !== 'OUT' && elementKey(edge.inV) === key));
    const ids = new Set([key, ...edges.flatMap(edge => [elementKey(edge.outV), elementKey(edge.inV)])]);
    data = { vertices: all.vertices.filter(vertex => ids.has(elementKey(vertex.id))), edges, truncated: false };
  } else {
    data = await api(`${graphUrl(graph)}/neighbors?${new URLSearchParams({ id: JSON.stringify(id), direction })}`, { signal });
  }
  const validId = value => typeof value === 'string' || Number.isSafeInteger(value);
  const validElement = value => value && validId(value.id) && typeof value.label === 'string' && value.label && (value.properties == null || (typeof value.properties === 'object' && !Array.isArray(value.properties)));
  if (!Array.isArray(data.vertices) || !Array.isArray(data.edges) || typeof data.truncated !== 'boolean' ||
      data.vertices.some(vertex => !validElement(vertex)) ||
      data.edges.some(edge => !validElement(edge) || !validId(edge.outV) || !validId(edge.inV))) {
    throw new Error('The portal returned invalid connection details. Please try again.');
  }
  if (!data.vertices.some(vertex => elementKey(vertex.id) === elementKey(id))) throw new Error('This node is no longer available. Search for another node or refresh the graph.');
  return data;
}

export function connectionGroups(data, node) {
  const groups = new Map();
  for (const connection of connectionsFor(data, node)) {
    const key = elementKey(connection.otherId);
    if (!groups.has(key)) groups.set(key, { id: connection.otherId, node: connection.other, relationships: [] });
    groups.get(key).relationships.push(connection);
  }
  return [...groups.values()];
}

// Preserve typed IDs and each distinct relationship, including parallel edges and loops.
export function connectionsFor(data, node) {
  const key = elementKey(node.id);
  const nodes = new Map(data.vertices.map(vertex => [elementKey(vertex.id), vertex]));
  return data.edges.flatMap(edge => {
    const outgoing = elementKey(edge.outV) === key;
    const incoming = elementKey(edge.inV) === key;
    if (!outgoing && !incoming) return [];
    const otherId = outgoing ? edge.inV : edge.outV;
    return [{ edge, source: nodes.get(elementKey(edge.outV)), target: nodes.get(elementKey(edge.inV)), other: nodes.get(elementKey(otherId)), otherId, direction: outgoing && incoming ? 'Self relationship' : outgoing ? 'Outgoing' : 'Incoming' }];
  });
}
