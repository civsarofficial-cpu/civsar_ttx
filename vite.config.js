import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleGenerate } from './api/_generate-core.js';
import { handleProxy } from './api/_proxy-core.js';

// Dev middleware so /api/generate and /api/proxy work under `npm run dev` too.
const apiDev = {
  name: 'api-dev',
  configureServer(server) {
    server.middlewares.use('/api/generate', async (req, res) => {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', async () => {
        const out = await handleGenerate(body ? JSON.parse(body) : {}, process.env);
        res.statusCode = out.status; res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(out.body));
      });
    });
    server.middlewares.use('/api/proxy', async (req, res) => {
      const out = await handleProxy(new URL(req.url, 'http://x').searchParams.get('url'), process.env);
      res.statusCode = out.status;
      for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
      res.setHeader('Content-Type', out.type); res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(out.body);
    });
  }
};
export default defineConfig({ plugins: [react(), apiDev] });
