import { api, graphUrl, valueText } from './api.js';

// Ignore superseded responses even if a fetch implementation ignores aborts.
export function createSearchRequests() {
  let active = null;
  const cancel = () => { active?.abort(); active = null; };
  return {
    cancel,
    start() {
      cancel();
      const controller = new AbortController();
      active = controller;
      return { signal: controller.signal, isCurrent: () => active === controller };
    },
  };
}

export async function findVertices({ graph, mode, initialData, query, exact, signal }) {
  let result;
  if (mode === 'demo') {
    const needle = query.toLowerCase();
    const matches = initialData.vertices.filter(vertex => [vertex.id, vertex.label, ...Object.values(vertex.properties || {})].some(item => item !== undefined && (exact ? valueText(item).toLowerCase() === needle : valueText(item).toLowerCase().includes(needle))));
    result = { vertices: matches.slice(0, 100), scanned: initialData.vertices.length, totalMatches: matches.length, truncated: false, resultsLimited: matches.length > 100 };
  } else {
    result = await api(`${graphUrl(graph)}/search?${new URLSearchParams({ value: query, exact: String(exact) })}`, { signal });
  }
  // Validate before storing results: malformed responses must not crash rendering.
  if (!Array.isArray(result.vertices) || result.vertices.length > 100 ||
      !Number.isSafeInteger(result.scanned) || result.scanned < 0 ||
      !Number.isSafeInteger(result.totalMatches) || result.totalMatches < result.vertices.length || result.totalMatches > result.scanned ||
      typeof result.truncated !== 'boolean' || typeof result.resultsLimited !== 'boolean' ||
      result.vertices.some(vertex => !vertex || (typeof vertex.id !== 'string' && !Number.isSafeInteger(vertex.id)) ||
        typeof vertex.label !== 'string' || !vertex.label ||
        (vertex.properties != null && (typeof vertex.properties !== 'object' || Array.isArray(vertex.properties))))) {
    throw Object.assign(new Error('The portal returned invalid search results. Try searching again.'), { code: 'INVALID_API_RESPONSE' });
  }
  return result;
}
