// Apoio dos testes que falam com o Supabase local (npx supabase start).
// As chamadas sao feitas com fetch cru, na mesma URL e com os mesmos
// cabecalhos que um atacante usaria contra a API REST.

import { config as carregarEnv } from 'dotenv';

carregarEnv({ quiet: true });

export const URL_BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const CHAVE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
export const CHAVE_SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!CHAVE_ANON || !CHAVE_SERVICO) {
  throw new Error(
    'Testes de integracao precisam de VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY no .env. ' +
      'No ambiente local: "npx supabase start" e copie os valores de "npx supabase status".',
  );
}

export interface Resposta<T = unknown> {
  status: number;
  corpo: T;
  texto: string;
}

async function chamar<T>(
  caminho: string,
  opcoes: { metodo?: string; token?: string; corpo?: unknown; cabecalhos?: Record<string, string> } = {},
): Promise<Resposta<T>> {
  const resposta = await fetch(`${URL_BASE}${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    headers: {
      apikey: CHAVE_ANON,
      Authorization: `Bearer ${opcoes.token ?? CHAVE_ANON}`,
      'Content-Type': 'application/json',
      ...opcoes.cabecalhos,
    },
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });

  const texto = await resposta.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }
  return { status: resposta.status, corpo: corpo as T, texto };
}

/** SELECT direto numa tabela, como um atacante faria. */
export function lerTabela<T = unknown[]>(tabela: string, token?: string, consulta = 'select=*'): Promise<Resposta<T>> {
  return chamar<T>(`/rest/v1/${tabela}?${consulta}`, { token });
}

export function inserirTabela(tabela: string, linha: unknown, token?: string): Promise<Resposta> {
  return chamar(`/rest/v1/${tabela}`, { metodo: 'POST', token, corpo: linha });
}

export function atualizarTabela(tabela: string, filtro: string, mudanca: unknown, token?: string): Promise<Resposta> {
  return chamar(`/rest/v1/${tabela}?${filtro}`, { metodo: 'PATCH', token, corpo: mudanca });
}

export function apagarTabela(tabela: string, filtro: string, token?: string): Promise<Resposta> {
  return chamar(`/rest/v1/${tabela}?${filtro}`, { metodo: 'DELETE', token });
}

export function chamarRpc<T = unknown>(funcao: string, argumentos: unknown = {}, token?: string): Promise<Resposta<T>> {
  return chamar<T>(`/rest/v1/rpc/${funcao}`, { metodo: 'POST', token, corpo: argumentos });
}

export function rpcComServico<T = unknown>(funcao: string, argumentos: unknown = {}): Promise<Resposta<T>> {
  return chamarRpc<T>(funcao, argumentos, CHAVE_SERVICO);
}

// --------------------------------------------------------------------- contas
export interface Conta {
  id: string;
  email: string;
  senha: string;
  nome: string;
  token: string;
}

let contador = 0;

function sufixo(): string {
  contador += 1;
  return `${Date.now().toString(36)}${contador}`;
}

/** Inscricao pelo fluxo publico do Supabase Auth (como no formulario). */
export async function inscrever(nomeBase: string): Promise<{ status: number; corpo: unknown; email: string; nome: string; senha: string }> {
  const s = sufixo();
  const email = `${nomeBase}-${s}@teste.exemplo`;
  const nome = `${nomeBase} ${s}`;
  const senha = 'senha-de-teste-123';

  const resposta = await chamar('/auth/v1/signup', {
    metodo: 'POST',
    corpo: { email, password: senha, data: { nome_exibicao: nome } },
  });

  return { status: resposta.status, corpo: resposta.corpo, email, nome, senha };
}

export async function entrar(email: string, senha: string): Promise<string> {
  const resposta = await chamar<{ access_token?: string }>('/auth/v1/token?grant_type=password', {
    metodo: 'POST',
    corpo: { email, password: senha },
  });
  if (!resposta.corpo?.access_token) {
    throw new Error(`login falhou (${resposta.status}): ${resposta.texto}`);
  }
  return resposta.corpo.access_token;
}

/** Cria uma conta ja no status e no papel pedidos, com token pronto. */
export async function criarConta(
  nomeBase: string,
  status: 'aguardando' | 'ativo' | 'recusado' | 'bloqueado' = 'ativo',
  papel: 'admin' | 'voluntario' = 'voluntario',
): Promise<Conta> {
  const inscricao = await inscrever(nomeBase);
  if (inscricao.status >= 400) {
    throw new Error(`inscricao falhou (${inscricao.status}): ${JSON.stringify(inscricao.corpo)}`);
  }

  const token = await entrar(inscricao.email, inscricao.senha);
  const perfil = await lerTabela<Array<{ id: string }>>('perfis', token);
  const id = perfil.corpo[0].id;

  if (status !== 'aguardando' || papel !== 'voluntario') {
    const resposta = await atualizarTabela('perfis', `id=eq.${id}`, { status, papel }, CHAVE_SERVICO);
    if (resposta.status >= 400) throw new Error(`ajuste do perfil falhou: ${resposta.texto}`);
  }

  return { id, email: inscricao.email, senha: inscricao.senha, nome: inscricao.nome, token };
}

export async function definirStatus(id: string, status: string): Promise<void> {
  const resposta = await atualizarTabela('perfis', `id=eq.${id}`, { status }, CHAVE_SERVICO);
  if (resposta.status >= 400) throw new Error(`mudanca de status falhou: ${resposta.texto}`);
}

/** Cria um local ativo de um perfil, com a chave de servico. */
export async function criarLocalAtivo(nome: string, perfilId: string, lat = -23.5505, lng = -46.6333): Promise<string> {
  // marcar_local depende de auth.uid(); com a chave de servico, o local e
  // inserido direto na tabela.
  const insercao = await inserirTabela(
    'locais',
    {
      nome,
      tipo: 'feira',
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      status: 'ativo',
      origem: 'manual',
      criado_por: perfilId,
      ativado_por: perfilId,
      ativado_em: new Date().toISOString(),
    },
    CHAVE_SERVICO,
  );
  if (insercao.status >= 400) throw new Error(`criacao do local falhou: ${insercao.texto}`);

  const lido = await lerTabela<Array<{ id: string }>>('locais', CHAVE_SERVICO, `select=id&nome=eq.${encodeURIComponent(nome)}`);
  return lido.corpo[0].id;
}

export async function somenteLeitura(ligado: boolean): Promise<void> {
  await atualizarTabela('config', 'id=eq.true', { somente_leitura: ligado }, CHAVE_SERVICO);
}
