export async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.message || `Request failed (${response.status})`), { status: response.status, code: data?.code });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw Object.assign(new Error('The portal returned an invalid API response. Check the connection and try again.'), { code: 'INVALID_API_RESPONSE' });
  }
  return data;
}

export async function createGraph(name, template) {
  const result = await api('/graphs', { method: 'POST', body: JSON.stringify({ name, template }) });
  if (result.name !== name) {
    throw Object.assign(new Error('Graph creation could not be confirmed. Check the graph list before trying again.'), { code: 'CREATION_UNCERTAIN' });
  }
  return result;
}

export const graphUrl = graph => `/graphs/${encodeURIComponent(graph)}`;
export const valueText = value => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
export const vertexName = vertex => String(vertex.properties?.name ?? vertex.properties?.title ?? vertex.properties?.label ?? vertex.id);
export const elementKey = id => JSON.stringify(id);
export const palette = ['#a991ee', '#a9cdff', '#c9ee99', '#ffbd98', '#f4a9ca', '#8ed8d0'];
export function labelColor(label, labels) { return palette[Math.max(0, labels.indexOf(label)) % palette.length]; }
