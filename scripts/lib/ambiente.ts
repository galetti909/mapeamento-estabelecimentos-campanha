// Cliente Supabase com a chave de servico, usado SOMENTE pelos scripts do
// administrador. A chave fica no .env local (ver .env.example) e nunca entra
// no repositorio nem no bundle do navegador.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as carregarEnv } from 'dotenv';

carregarEnv({ quiet: true });

export interface Ambiente {
  url: string;
  chaveServico: string;
}

export function lerAmbiente(): Ambiente {
  const url = process.env.SUPABASE_URL;
  const chaveServico = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const faltando: string[] = [];
  if (!url) faltando.push('SUPABASE_URL');
  if (!chaveServico) faltando.push('SUPABASE_SERVICE_ROLE_KEY');

  if (faltando.length > 0) {
    throw new Error(
      `Falta definir no .env: ${faltando.join(', ')}.\n` +
        'Copie .env.example para .env e preencha com os dados do projeto Supabase.\n' +
        'No ambiente local, os valores aparecem em "npx supabase status".',
    );
  }

  return { url: url as string, chaveServico: chaveServico as string };
}

export function clienteServico(): SupabaseClient {
  const { url, chaveServico } = lerAmbiente();
  return createClient(url, chaveServico, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-aplicacao': 'mapa-de-campanha-scripts' } },
  });
}

/** Leitura de argumentos no formato --chave valor / --flag. */
export function lerArgumentos(argv: string[] = process.argv.slice(2)): Record<string, string | true> {
  const args: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const atual = argv[i];
    if (!atual.startsWith('--')) continue;
    const chave = atual.slice(2);
    const proximo = argv[i + 1];
    if (proximo && !proximo.startsWith('--')) {
      args[chave] = proximo;
      i += 1;
    } else {
      args[chave] = true;
    }
  }
  return args;
}

export function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Nova tentativa com espera crescente (erros 429 e 504 do Overpass). */
export async function tentarComEspera<T>(
  acao: () => Promise<T>,
  opcoes: { tentativas?: number; esperaInicialMs?: number; aoFalhar?: (erro: unknown, tentativa: number, esperaMs: number) => void } = {},
): Promise<T> {
  const tentativas = opcoes.tentativas ?? 5;
  let espera = opcoes.esperaInicialMs ?? 5000;

  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      return await acao();
    } catch (erro) {
      if (tentativa === tentativas) throw erro;
      opcoes.aoFalhar?.(erro, tentativa, espera);
      await esperar(espera);
      espera *= 2;
    }
  }

  throw new Error('inalcancavel');
}

export function registrar(...partes: unknown[]): void {
  console.log(`[${new Date().toISOString()}]`, ...partes);
}
