import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildApp } from './app.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const app = await buildApp({
  dbFile: process.env.DB_FILE ?? resolve(root, 'data', 'drums.db'),
  staticDir: resolve(root, 'dist'),
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '0.0.0.0' });
