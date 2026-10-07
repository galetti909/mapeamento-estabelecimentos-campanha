import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY vem das variaveis do site
// (ver .env.example). A chave anon pode ser publica: quem protege os dados e
// o RLS do Postgres, nao o front-end. A chave de servico NUNCA entra aqui.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chaveAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !chaveAnon) {
  throw new Error(
    'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variaveis do site (ver .env.example).',
  );
}

export const SUPABASE_URL = url;

export const supabase: SupabaseClient = createClient(url, chaveAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'mapa-de-campanha-sessao',
  },
  global: {
    headers: { 'x-aplicacao': 'mapa-de-campanha' },
  },
});

/** Chama a Edge Function admin-usuarios com o token do administrador. */
export async function chamarAdminUsuarios<T>(
  acao: string,
  corpo: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', {
    body: { acao, ...corpo },
  });
  if (error) {
    // O corpo da resposta de erro traz o codigo que erros.ts sabe traduzir.
    const contexto = (error as { context?: Response }).context;
    if (contexto && typeof contexto.json === 'function') {
      try {
        const detalhe = await contexto.json();
        throw Object.assign(new Error(detalhe.erro ?? error.message), { code: detalhe.erro });
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw error;
  }
  return data as T;
}
