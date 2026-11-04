import fs from 'node:fs';
import path from 'node:path';
import {defineConfig, type Plugin} from 'vite';

function wincreateStaticStudioPlugin(): Plugin {
  const rootDir = __dirname;
  const publicDir = path.resolve(rootDir, 'public');

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
  };

  return {
    name: 'wincreate-static-studio',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
          return next();
        }
        const rawPath = req.url.split('?')[0] || '/';
        if (rawPath === '/' || rawPath === '/index.html') {
          const indexPath = path.resolve(rootDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Referrer-Policy', 'no-referrer');
            res.end(fs.readFileSync(indexPath));
            return;
          }
        }

        const relPath = rawPath.replace(/^\/+/, '');
        const candidate = path.resolve(publicDir, relPath);
        if (
          candidate.startsWith(publicDir) &&
          fs.existsSync(candidate) &&
          fs.statSync(candidate).isFile()
        ) {
          const ext = path.extname(candidate).toLowerCase();
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.end(fs.readFileSync(candidate));
          return;
        }
        next();
      });
    },
    closeBundle() {
      const distDir = path.resolve(rootDir, 'dist');
      fs.mkdirSync(distDir, {recursive: true});
      const indexPath = path.resolve(rootDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, path.resolve(distDir, 'index.html'));
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [wincreateStaticStudioPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/main.tsx'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
