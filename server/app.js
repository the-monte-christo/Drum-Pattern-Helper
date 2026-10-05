import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { openStore } from './db.js';

const idParam = {
  type: 'object',
  properties: { id: { type: 'integer', minimum: 1 } },
  required: ['id'],
};

export async function buildApp({ dbFile, staticDir, logger = false, seed = true } = {}) {
  const app = Fastify({ logger, bodyLimit: 256 * 1024 });
  const store = openStore(dbFile, { seed });
  app.addHook('onClose', async () => store.close());

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/patterns', async () => store.list());

  app.get('/api/patterns/:id', { schema: { params: idParam } }, async (req, reply) => {
    const p = store.get(req.params.id);
    return p ?? reply.code(404).send({ error: 'Pattern nicht gefunden' });
  });

  app.post('/api/patterns', async (req, reply) => {
    reply.code(201);
    return store.create(req.body ?? {});
  });

  app.put('/api/patterns/:id', { schema: { params: idParam } }, async (req, reply) => {
    const p = store.update(req.params.id, req.body ?? {});
    return p ?? reply.code(404).send({ error: 'Pattern nicht gefunden' });
  });

  app.delete('/api/patterns/:id', { schema: { params: idParam } }, async (req, reply) => {
    if (!store.remove(req.params.id)) return reply.code(404).send({ error: 'Pattern nicht gefunden' });
    return reply.code(204).send();
  });

  const indexFile = staticDir && join(staticDir, 'index.html');
  if (indexFile && existsSync(indexFile)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      setHeaders(reply, path) {
        // Gehashte Vite-Bundles sind unveränderlich, alles andere (index.html, sw.js) immer prüfen.
        if (/[\\/]assets[\\/]/.test(path)) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          reply.header('Cache-Control', 'no-cache');
        }
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    // SPA-Fallback nur für Seitenaufrufe – fehlende Dateien (z. B. alte Asset-Hashes) bleiben 404.
    const path = req.url.split('?')[0];
    const isPage = !path.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(path);
    if (req.method === 'GET' && isPage && indexFile && existsSync(indexFile)) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Nicht gefunden' });
  });

  return app;
}
