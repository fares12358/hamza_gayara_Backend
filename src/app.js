import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { apiRouter } from './modules/index.js';
import { originCheck } from './middleware/originCheck.js';
import { cors } from './middleware/cors.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'upgrade-insecure-requests': env.isProduction ? [] : null,
        },
      },
    }),
  );
  // Before the body readers, so their error messages can be read by the app too.
  app.use('/api', cors);
  // Cheque photos need a larger body. Everything else stays small.
  app.use('/api/cheques', express.json({ limit: '2.5mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', originCheck, apiRouter);
  app.use('/api', notFound);

  if (env.serveFrontend) {
    app.use(express.static(frontendDist));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
