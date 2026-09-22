import { readConfig } from './config.mjs';
import { createApp } from './app.mjs';
process.umask(0o077);
const config = readConfig();
const service = await createApp(config);
const server = service.app.listen(config.port, config.host, () => {
  console.log(`Refract listening on ${config.host}:${config.port}`);
});
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  server.close(() => { service.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
