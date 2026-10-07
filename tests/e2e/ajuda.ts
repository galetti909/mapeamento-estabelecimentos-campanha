// Apoio dos testes de ponta a ponta. As contas sao criadas pela API (como na
// inscricao real) e liberadas com a chave de servico, que fica somente no
// ambiente de teste.

import { expect, test, type Page } from '@playwright/test';
import { config as carregarEnv } from 'dotenv';

carregarEnv({ quiet: true });

export const URL_SUPABASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const CHAVE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
export const CHAVE_SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const SENHA_PADRAO = 'senha-de-teste-123';

/** Centro de Sao Paulo: dentro da amostra da malha do IBGE usada nos testes. */
export const CENTRO_SP = { lat: -23.5505, lng: -46.6333 };

/**
 * Canto sul de Sao Paulo, dentro do municipio e longe de CENTRO_SP, onde
 * ficam os locais criados pela API. Cada pagina de teste recebe um ponto
 * proprio desta grade (ver areaLivreParaTeste): um local marcado pela
 * interface fica exatamente onde o teste clicou, e sem a grade o teste
 * seguinte clicaria sobre esse marcador, que nao repassa o clique ao mapa.
 */
export const AREA_LIVRE_SP = { lat: -23.95, lng: -46.75, zoom: 17 };

/**
 * Espacamento da grade. Precisa ser maior que a area que a tela cobre. No
 * zoom 17 uma tela de computador (1280 px) cobre cerca de 0,014 grau de
 * longitude; 0,05 grau de passo deixa margem folgada.
 */
const PASSO_GRADE = 0.05;

const COLUNAS = 12;

/** Hash estavel de um texto, para escolher sempre o mesmo ponto da grade. */
function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Ponto livre da grade para o teste em execucao, sempre dentro do retangulo
 * de Sao Paulo da amostra da malha (lat -24,008..-23,357 /
 * lng -46,826..-46,365).
 *
 * O indice vem do nome do teste e do projeto, nao de um contador: quando o
 * Playwright troca de projeto ele pode reiniciar o processo do worker, e um
 * contador zeraria — dois testes cairiam no mesmo ponto, um encontrando o
 * marcador que o outro deixou.
 */
export function areaLivreParaTeste(): { lat: number; lng: number; zoom: number } {
  let semente = 'padrao';
  try {
    const info = test.info();
    semente = `${info.project.name}::${info.titlePath.join(' > ')}`;
  } catch {
    // Fora de um teste: fica o ponto padrao.
  }

  const indice = hash(semente) % (COLUNAS * 8);
  return {
    lat: AREA_LIVRE_SP.lat + (indice % COLUNAS) * PASSO_GRADE,
    lng: AREA_LIVRE_SP.lng + Math.floor(indice / COLUNAS) * PASSO_GRADE,
    zoom: AREA_LIVRE_SP.zoom,
  };
}

let contador = 0;

/** Sufixo curto e unico, para nomes e e-mails de teste nao colidirem. */
export function identificador(prefixo: string): string {
  contador += 1;
  return `${prefixo}-${Date.now().toString(36)}-${contador}`;
}


async function api<T>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; chave?: string } = {},
): Promise<{ status: number; corpo: T; texto: string }> {
  const chave = opcoes.chave ?? CHAVE_SERVICO;
  const resposta = await fetch(`${URL_SUPABASE}${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
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

export interface ContaTeste {
  id: string;
  email: string;
  senha: string;
  nome: string;
}

/** Cria uma conta ja com o status e o papel pedidos. */
export async function criarConta(
  prefixo: string,
  status: 'aguardando' | 'ativo' | 'recusado' | 'bloqueado' = 'ativo',
  papel: 'admin' | 'voluntario' = 'voluntario',
): Promise<ContaTeste> {
  const marca = identificador(prefixo);
  const email = `${marca}@teste.exemplo`;
  const nome = `${prefixo} ${marca.slice(-10)}`;

  const criacao = await api<{ id: string }>('/auth/v1/admin/users', {
    metodo: 'POST',
    corpo: {
      email,
      password: SENHA_PADRAO,
      email_confirm: true,
      user_metadata: { nome_exibicao: nome },
    },
  });
  if (criacao.status >= 400) throw new Error(`criacao da conta falhou: ${criacao.texto}`);

  const id = criacao.corpo.id;

  if (status !== 'aguardando' || papel !== 'voluntario') {
    const ajuste = await api(`/rest/v1/perfis?id=eq.${id}`, {
      metodo: 'PATCH',
      corpo: { status, papel },
    });
    if (ajuste.status >= 400) throw new Error(`ajuste do perfil falhou: ${ajuste.texto}`);
  }

  return { id, email, senha: SENHA_PADRAO, nome };
}

export async function definirPerfil(id: string, mudanca: Record<string, unknown>): Promise<void> {
  const resposta = await api(`/rest/v1/perfis?id=eq.${id}`, { metodo: 'PATCH', corpo: mudanca });
  if (resposta.status >= 400) throw new Error(`mudanca de perfil falhou: ${resposta.texto}`);
}

/** Cria um local ativo pertencente a conta indicada. */
export async function criarLocal(
  nome: string,
  perfilId: string,
  posicao: { lat: number; lng: number } = CENTRO_SP,
  tipo = 'feira',
): Promise<string> {
  const resposta = await api<Array<{ id: string }>>('/rest/v1/locais', {
    metodo: 'POST',
    corpo: {
      nome,
      tipo,
      geom: `SRID=4326;POINT(${posicao.lng} ${posicao.lat})`,
      status: 'ativo',
      origem: 'manual',
      criado_por: perfilId,
      ativado_por: perfilId,
      ativado_em: new Date().toISOString(),
    },
  });
  if (resposta.status >= 400) throw new Error(`criacao do local falhou: ${resposta.texto}`);
  return resposta.corpo[0].id;
}

export async function criarLocalImportado(nome: string, origemId: string, posicao = CENTRO_SP): Promise<string> {
  const resposta = await api<Array<{ id: string }>>('/rest/v1/locais', {
    metodo: 'POST',
    corpo: {
      nome,
      tipo: 'feira',
      geom: `SRID=4326;POINT(${posicao.lng} ${posicao.lat})`,
      status: 'importado',
      origem: 'osm',
      origem_id: origemId,
      osm_tags: { amenity: 'marketplace' },
    },
  });
  if (resposta.status >= 400) throw new Error(`criacao do importado falhou: ${resposta.texto}`);
  return resposta.corpo[0].id;
}

/** Abre um pedido de liberacao de limite para a conta indicada. */
export async function criarPedidoLimite(perfilId: string): Promise<string> {
  const resposta = await api<Array<{ id: string }>>('/rest/v1/pedidos_limite', {
    metodo: 'POST',
    corpo: { perfil_id: perfilId, status: 'aberto' },
  });
  if (resposta.status >= 400) throw new Error(`criacao do pedido falhou: ${resposta.texto}`);
  return resposta.corpo[0].id;
}

export async function definirSomenteLeitura(ligado: boolean): Promise<void> {
  await api('/rest/v1/config?id=eq.true', { metodo: 'PATCH', corpo: { somente_leitura: ligado } });
}

export async function contarLocaisDaConta(perfilId: string, status = 'ativo'): Promise<number> {
  const resposta = await api<Array<{ id: string }>>(
    `/rest/v1/locais?select=id&status=eq.${status}&or=(ativado_por.eq.${perfilId},criado_por.eq.${perfilId})&limit=10000`,
  );
  return resposta.corpo.length;
}

export async function statusDoLocal(id: string): Promise<string> {
  const resposta = await api<Array<{ status: string }>>(`/rest/v1/locais?select=status&id=eq.${id}`);
  return resposta.corpo[0]?.status ?? 'inexistente';
}

export async function nomeDoLocal(id: string): Promise<string> {
  const resposta = await api<Array<{ nome: string }>>(`/rest/v1/locais?select=nome&id=eq.${id}`);
  return resposta.corpo[0]?.nome ?? '';
}

// ---------------------------------------------------------------- navegador

/**
 * Define a area inicial do mapa para o teste. Chamada depois de
 * prepararPagina, vale mais que ela: os scripts de inicializacao rodam na
 * ordem em que foram registrados.
 */
export async function definirAreaInicial(
  page: Page,
  area: { lat: number; lng: number; zoom: number },
): Promise<void> {
  await page.addInitScript((guardada) => {
    try {
      localStorage.setItem('mapa-de-campanha-area', JSON.stringify(guardada));
    } catch {
      // Sem localStorage, o mapa abre no Brasil inteiro.
    }
  }, area);
}


/**
 * Prepara a pagina: nao baixa tiles do OpenStreetMap (os testes nao dependem
 * de rede externa) e devolve uma imagem vazia no lugar de cada tile.
 */
export async function prepararPagina(page: Page): Promise<void> {
  // A amostra da malha do IBGE usada nos testes cobre dez municipios. O mapa
  // comeca numa area vazia de Sao Paulo, propria deste teste: no enquadramento
  // do Brasil inteiro, o centro da tela cairia em Mato Grosso, fora da amostra.
  await definirAreaInicial(page, areaLivreParaTeste());

  await page.route('**/tile.openstreetmap.org/**', (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'image/png',
      // PNG transparente de 1x1.
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  );
}

export async function entrar(page: Page, conta: { email: string; senha: string }): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Entrar' }).click();
  await page.getByLabel('E-mail').fill(conta.email);
  await page.getByLabel('Senha', { exact: true }).fill(conta.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

export async function entrarEAbrirMapa(page: Page, conta: { email: string; senha: string }): Promise<void> {
  await entrar(page, conta);
  await expect(page.locator('#mapa')).toBeVisible({ timeout: 20000 });
  await esperarMapaPronto(page);
}

export async function esperarMapaPronto(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('.leaflet-container') !== null,
    undefined,
    { timeout: 20000 },
  );
  await page.waitForTimeout(600); // deixa a primeira carga de marcadores terminar
}

export async function abrirMenu(page: Page): Promise<void> {
  const menu = page.locator('#menu');
  if (await menu.isHidden()) {
    await page.getByRole('button', { name: 'Abrir menu' }).click();
  }
  await expect(menu).toBeVisible();
}

/**
 * Navega pelo menu e espera a tela de destino aparecer.
 *
 * A espera pelo titulo e obrigatoria: sem ela, o teste seguiria interagindo
 * com a tela anterior (o mapa, por exemplo, que tem a propria caixa de busca)
 * e preencheria o campo errado.
 */
export async function irPelaMenu(
  page: Page,
  nome: string | RegExp,
  tituloEsperado: string | RegExp,
): Promise<void> {
  await abrirMenu(page);
  await page.locator('#menu').getByRole('link', { name: nome }).click();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.getByRole('heading', { name: tituloEsperado })).toBeVisible();
}

/** Abre a ficha de um local pela rota #/mapa/<id>. */
export async function abrirFichaDoLocal(page: Page, localId: string): Promise<void> {
  await page.goto(`/#/mapa/${localId}`);
  await esperarMapaPronto(page);
  await expect(page.getByRole('dialog', { name: 'Ficha do local' })).toBeVisible();
}

/**
 * Clica no centro do mapa (modo "Marcar local"). O mapa abre em
 * AREA_LIVRE_SP, sem marcador nenhum a vista, de modo que o clique sempre
 * chega ao fundo do mapa.
 */
export async function clicarNoMapa(page: Page): Promise<void> {
  const caixa = await page.locator('#mapa').boundingBox();
  if (!caixa) throw new Error('o mapa nao tem tamanho');
  await page.mouse.click(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
}

export function aviso(page: Page, texto: string | RegExp) {
  return page.locator('.aviso-flutuante', { hasText: texto });
}
