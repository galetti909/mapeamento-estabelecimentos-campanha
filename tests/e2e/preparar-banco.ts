/**
 * globalSetup do Playwright: recria o banco local antes da suite de ponta a
 * ponta.
 *
 * Os testes de ponta a ponta leem e escrevem no mesmo banco, e alguns contam
 * linhas. Sem recriar, os dados das suites anteriores (pgTAP nao deixa nada,
 * mas Vitest deixa) e das execucoes passadas mudariam as contagens. "supabase
 * db reset" tambem aplica as migrations e o seed, de modo que a suite sempre
 * roda contra o schema atual.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const rodar = promisify(execFile);

export default async function prepararBanco(): Promise<void> {
  if (process.env.MAPA_PULAR_RESET === '1') {
    console.log('[e2e] MAPA_PULAR_RESET=1: o banco nao sera recriado.');
    return;
  }

  console.log('[e2e] recriando o banco local (supabase db reset)...');
  const inicio = Date.now();
  await rodar('npx', ['supabase', 'db', 'reset'], {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  console.log(`[e2e] banco recriado em ${((Date.now() - inicio) / 1000).toFixed(0)}s.`);
}
