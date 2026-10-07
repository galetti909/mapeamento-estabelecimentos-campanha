import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Dominio do servidor de tiles (ver src/lib/mapa-base.ts). */
const DOMINIO_TILES = 'https://tile.openstreetmap.org';

/**
 * Gera dist/_headers (formato do Netlify) com a Content-Security-Policy
 * montada a partir da URL do Supabase: so o proprio dominio, o dominio do
 * Supabase e o servidor de tiles.
 *
 * 'unsafe-inline' em style-src e necessario porque o Leaflet posiciona os
 * tiles e os marcadores pelo atributo style dos elementos. Nenhum script
 * inline e permitido.
 */
function cabecalhosDeSeguranca(urlSupabase: string): Plugin {
  const origem = (() => {
    try {
      return new URL(urlSupabase).origin;
    } catch {
      return '';
    }
  })();

  const supabaseWs = origem.replace(/^http/, 'ws');

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${DOMINIO_TILES}`,
    `connect-src 'self' ${origem} ${supabaseWs}`.trim(),
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ');

  const cabecalhos = [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Frame-Options: DENY',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '',
  ].join('\n');

  return {
    name: 'cabecalhos-de-seguranca',
    apply: 'build',
    writeBundle(opcoes) {
      const destino = opcoes.dir ?? 'dist';
      writeFileSync(join(destino, '_headers'), cabecalhos, 'utf8');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [cabecalhosDeSeguranca(env.VITE_SUPABASE_URL ?? '')],
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          // Leaflet sai num chunk proprio: o orcamento de 200 KB do bundle
          // inicial e medido sem ele (ver Requisitos nao funcionais).
          manualChunks(id: string) {
            if (id.includes('node_modules/leaflet')) return 'leaflet';
            return undefined;
          },
        },
      },
    },
    server: { port: 5173 },
    preview: { port: 4173 },
  };
});
