import { createApp } from './app.js';
import { HugeGraphClient, readConfig } from './hugegraph.js';

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const app = createApp(new HugeGraphClient(readConfig()));
const server = app.listen(port, host, () => console.log(`HugeGraph Portal API: http://${host}:${port}`));
server.on('error', error => {
  console.error(`Could not start the portal on ${host}:${port}: ${error.code || error.message}`);
  process.exitCode = 1;
});
