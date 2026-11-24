import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from './hugegraph.js';

function queryString(query, key, fallback = '') {
  const value = query[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new ApiError(400, `Invalid ${key}. Supply a single value.`);
  return value;
}

export function createApp(client) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', async (req, res) => {
    await client.graphs();
    res.json({ connected: true, mode: await client.root(), allowCreate: client.config.allowCreate });
  });
  app.get('/api/graphs', async (req, res) => res.json({ graphs: await client.graphs(), allowCreate: client.config.allowCreate }));
  app.post('/api/graphs', async (req, res) => res.status(201).json(await client.createGraph(req.body?.name, req.body?.template)));
  app.get('/api/graphs/:graph/snapshot', async (req, res) => res.json(await client.snapshot(req.params.graph)));
  app.get('/api/graphs/:graph/search', async (req, res) => {
    const property = queryString(req.query, 'property');
    const value = queryString(req.query, 'value');
    const label = queryString(req.query, 'label');
    const exact = queryString(req.query, 'exact', 'false');
    if (!['true', 'false'].includes(exact)) throw new ApiError(400, 'exact must be true or false.');
    if (!value.trim() && !label) throw new ApiError(400, 'Enter a property value or select a label.');
    res.json(await client.search(req.params.graph, { property, value, label, exact: exact === 'true' }));
  });
  app.get('/api/graphs/:graph/neighbors', async (req, res) => {
    if (typeof req.query.id !== 'string') throw new ApiError(400, 'id must be a JSON string or number.');
    let id;
    try { id = JSON.parse(req.query.id); } catch { throw new ApiError(400, 'id must be a JSON string or number.'); }
    if (typeof id !== 'string' && !(typeof id === 'number' && Number.isSafeInteger(id))) throw new ApiError(400, 'id must be a string or safe integer.');
    const direction = queryString(req.query, 'direction', 'BOTH');
    if (!['BOTH', 'OUT', 'IN'].includes(direction)) throw new ApiError(400, 'Invalid relationship direction.');
    res.json(await client.neighbors(req.params.graph, id, direction));
  });
  app.get('/api/graphs/:graph/:kind', async (req, res) => {
    if (!['vertices', 'edges'].includes(req.params.kind)) throw new ApiError(404, 'API endpoint not found.');
    const limit = Number(queryString(req.query, 'limit', '50'));
    const page = queryString(req.query, 'page');
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new ApiError(400, 'Invalid pagination parameters.');
    res.json(await client.page(req.params.graph, req.params.kind, { page, limit }));
  });
  app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint not found.' }));
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  app.use(express.static(dist));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  app.use((error, req, res, next) => {
    const status = error.status >= 400 && error.status <= 599 ? error.status : 500;
    res.status(status).json({ message: status === 500 ? 'The portal encountered an unexpected error.' : error.message, ...(error.code ? { code: error.code } : {}) });
  });
  return app;
}
