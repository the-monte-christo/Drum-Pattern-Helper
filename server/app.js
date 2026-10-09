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

// REST-Endpunkte (Liste, Lesen, Anlegen, Ersetzen, Löschen) für eine Sammlung.
function crud(app, path, collection, notFound) {
  const missing = (reply) => reply.code(404).send({ error: notFound });

  app.get(path, async () => collection.list());

  app.get(`${path}/:id`, { schema: { params: idParam } }, async (req, reply) => {
    return collection.get(req.params.id) ?? missing(reply);
  });

  app.post(path, async (req, reply) => {
    reply.code(201);
    return collection.create(req.body ?? {});
  });

  app.put(`${path}/:id`, { schema: { params: idParam } }, async (req, reply) => {
    return collection.update(req.params.id, req.body ?? {}) ?? missing(reply);
  });

  app.delete(`${path}/:id`, { schema: { params: idParam } }, async (req, reply) => {
    if (!collection.remove(req.params.id)) return missing(reply);
    return reply.code(204).send();
  });
}

export async function buildApp({ dbFile, staticDir, logger = false, seed = true } = {}) {
  const app = Fastify({ logger, bodyLimit: 256 * 1024 });
  const store = openStore(dbFile, { seed });
  app.addHook('onClose', async () => store.close());

  app.get('/api/health', async () => ({ ok: true }));

  crud(app, '/api/patterns', store.patterns, 'Pattern nicht gefunden');
  crud(app, '/api/arrangements', store.arrangements, 'Arrangement nicht gefunden');

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
