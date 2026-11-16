import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AirQualityQuerySchema,
  AssistantRequestSchema,
  LocationSearchQuerySchema,
} from './src/lib/validation.ts';
import { fetchLiveEnvironmentalSnapshot, searchLocations } from './server/envData.ts';
import { generateAssistantAdvice } from './server/geminiAssistant.ts';
import { PRESET_CITIES } from './src/data/presets.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Simple sliding-window per-IP rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (rateBuckets.size > 500) rateBuckets.clear();
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a few seconds before trying again.',
      });
    }

    bucket.count += 1;
    return next();
  };
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self)');
    next();
  });

  // Restrictive CORS allowing same-origin and configured APP_URL
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const appUrl = process.env.APP_URL;
    const allowedOrigins = new Set<string>(['http://localhost:3000', 'http://127.0.0.1:3000']);
    if (appUrl && appUrl !== 'MY_APP_URL') {
      allowedOrigins.add(appUrl.replace(/\/$/, ''));
    }

    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'AIRWISE AI',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/locations/search', rateLimit(40, 60_000), async (req, res) => {
    const parsed = LocationSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid search query.',
      });
    }
    const results = await searchLocations(parsed.data.q);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({ results });
  });

  app.get('/api/air-quality', rateLimit(60, 60_000), async (req, res) => {
    const parsed = AirQualityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Valid latitude and longitude coordinates are required.',
      });
    }

    const { lat, lon, name, region, country, countryCode, timezone } = parsed.data;
    const presetMatch = PRESET_CITIES.find(
      (c) => Math.abs(c.latitude - lat) < 0.05 && Math.abs(c.longitude - lon) < 0.05
    );

    const location = presetMatch ?? {
      id: `coord-${lat.toFixed(2)}-${lon.toFixed(2)}`,
      name: name ?? `Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`,
      region: region ?? 'Selected Area',
      country: country ?? (countryCode === 'IN' ? 'India' : 'Selected Region'),
      countryCode: countryCode ?? (lat >= 6 && lat <= 37 && lon >= 68 && lon <= 98 ? 'IN' : 'XX'),
      latitude: lat,
      longitude: lon,
      timezone: timezone ?? 'auto',
      isIndia:
        countryCode?.toUpperCase() === 'IN' ||
        (lat >= 6.5 && lat <= 36 && lon >= 68 && lon <= 97.5),
    };

    const snapshot = await fetchLiveEnvironmentalSnapshot(location);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({ snapshot });
  });

  app.post('/api/assistant', rateLimit(20, 60_000), async (req, res) => {
    const parsed = AssistantRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid assistant request payload.',
      });
    }

    const reply = await generateAssistantAdvice(parsed.data);
    return res.json({ reply });
  });

  // Malformed JSON & safe error handler (never leaks stack traces)
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON request body.' });
    }
    if (err) {
      return res.status(500).json({ error: 'An unexpected server error occurred.' });
    }
    return next();
  });

  return app;
}

async function startServer() {
  const app = createApp();

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AIRWISE AI server listening on http://localhost:${PORT}`);
  });
}

// Only start listening when executed as entrypoint, not when imported by integration tests
const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  startServer();
}
