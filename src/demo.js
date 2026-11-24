// Deliberately separate from live data. This fixture never writes to HugeGraph.
const people = [
  ['ada', 'Ada Lovelace', 'London', 'Mathematics'],
  ['alan', 'Alan Turing', 'London', 'Computer science'],
  ['grace', 'Grace Hopper', 'New York', 'Computer science'],
  ['katherine', 'Katherine Johnson', 'Virginia', 'Mathematics'],
  ['margaret', 'Margaret Hamilton', 'Cambridge', 'Software engineering'],
  ['tim', 'Tim Berners-Lee', 'London', 'Computer science'],
];
const vertices = [
  ...people.map(([id, name, city, field]) => ({ id: `person:${id}`, label: 'researcher', properties: { name, city, field } })),
  ...['Analytical Engine', 'Apollo', 'World Wide Web', 'COBOL'].map((name, i) => ({ id: `project:${i}`, label: 'project', properties: { name, status: 'Published', year: [1843, 1969, 1989, 1959][i] } })),
  ...['University of Cambridge', 'NASA', 'MIT'].map((name, i) => ({ id: `org:${i}`, label: 'institution', properties: { name, country: i ? 'United States' : 'United Kingdom' } })),
  ...['Mathematics', 'Computer science', 'Software engineering'].map((name, i) => ({ id: `field:${i}`, label: 'field', properties: { name } })),
];
const links = [
  [0, 6, 'contributed_to'], [0, 13, 'researches'], [1, 10, 'affiliated_with'], [1, 14, 'researches'],
  [2, 9, 'created'], [2, 14, 'researches'], [3, 7, 'contributed_to'], [3, 11, 'affiliated_with'],
  [3, 13, 'researches'], [4, 7, 'contributed_to'], [4, 12, 'affiliated_with'], [4, 15, 'researches'],
  [5, 8, 'created'], [5, 12, 'affiliated_with'], [5, 14, 'researches'], [7, 11, 'developed_at'],
  [8, 14, 'part_of'], [9, 14, 'part_of'], [0, 1, 'inspired'], [2, 4, 'inspired'],
];
const edges = links.map(([s, t, label], i) => ({ id: `edge:${i}`, label, outV: vertices[s].id, inV: vertices[t].id, properties: { source: 'Demo dataset' } }));
export const demoGraphs = [
  { name: 'research_network', description: 'People, projects, and the ideas that connect them.', tag: 'RESEARCH', vertices: vertices.length, edges: edges.length },
  { name: 'knowledge_garden', description: 'A little space for your big, connected ideas.', tag: 'KNOWLEDGE', vertices: 10 },
  { name: 'project_connections', description: 'Follow the relationships behind great projects.', tag: 'PROJECTS', vertices: 8 },
  { name: 'people_and_places', description: 'Explore the people and places in your network.', tag: 'COMMUNITY', vertices: 12 },
].map(graph => ({ ...graph, edges: snapshotFor(graph.vertices).edges.length }));

export function demoSnapshot(graph) {
  const entry = demoGraphs.find(item => item.name === graph);
  if (!entry) throw new Error('This graph is not part of the demo dataset.');
  return snapshotFor(entry.vertices);
}

function snapshotFor(count) {
  const chosen = vertices.slice(0, count);
  const ids = new Set(chosen.map(vertex => vertex.id));
  return { vertices: chosen, edges: edges.filter(edge => ids.has(edge.outV) && ids.has(edge.inV)), truncated: false };
}
