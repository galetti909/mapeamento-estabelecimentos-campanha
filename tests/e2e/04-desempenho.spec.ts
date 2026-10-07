// ===========================================================================
// Desempenho com a base cheia: 50 mil locais.
//
// Roda por ultimo (nome 04-) de proposito: a carga espalha marcadores por
// todo o municipio de Sao Paulo, onde os outros testes clicam no mapa.
// ===========================================================================
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import {
  CHAVE_ANON, CHAVE_SERVICO, URL_SUPABASE, abrirFichaDoLocal, criarConta,
  definirAreaInicial, entrarEAbrirMapa, esperarMapaPronto, prepararPagina,
} from './ajuda.js';

const rodar = promisify(execFile);

const TOTAL_ALVO = 50_000;
const LIMITE_CONSULTA_MS = 300;
const LIMITE_PRIMEIRO_MAPA_MS = 3000;

async function contarLocais(): Promise<number> {
  const resposta = await fetch(`${URL_SUPABASE}/rest/v1/locais?select=id`, {
    headers: {
      apikey: CHAVE_SERVICO,
      Authorization: `Bearer ${CHAVE_SERVICO}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  const faixa = resposta.headers.get('content-range') ?? '*/0';
  return Number(faixa.split('/')[1] ?? 0);
}

test.describe('base com 50 mil locais', () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeAll(async () => {
    if ((await contarLocais()) >= TOTAL_ALVO) return;

    // A carga e feita por SQL, fora do app, como seria uma importacao real
    // (ver tests/e2e/semear-desempenho.sql).
    const { stdout, stderr } = await rodar(
      'bash',
      [
        '-c',
        'docker exec -i supabase_db_mapa-de-campanha psql -U postgres -d postgres -q '
          + '< tests/e2e/semear-desempenho.sql',
      ],
      { cwd: process.cwd(), maxBuffer: 50 * 1024 * 1024, timeout: 240_000 },
    );

    if (/ERROR/i.test(stderr)) throw new Error(`carga falhou: ${stderr}`);
    if (stdout.trim()) console.log(`[desempenho] carga: ${stdout.trim()}`);

    expect(await contarLocais()).toBeGreaterThanOrEqual(TOTAL_ALVO);
  });

  test('locais_na_area responde em menos de 300 ms com 50 mil locais', async () => {
    const conta = await criarConta('perf-consulta');

    const entrar = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: CHAVE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: conta.email, password: conta.senha }),
    });
    const { access_token: token } = (await entrar.json()) as { access_token: string };

    const chamar = async (corpo: Record<string, unknown>): Promise<number> => {
      const inicio = Date.now();
      const resposta = await fetch(`${URL_SUPABASE}/rest/v1/rpc/locais_na_area`, {
        method: 'POST',
        headers: {
          apikey: CHAVE_ANON,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(corpo),
      });
      expect(resposta.status).toBe(200);
      const linhas = (await resposta.json()) as unknown[];
      expect(linhas.length).toBeGreaterThan(0);
      return Date.now() - inicio;
    };

    // Area densa da carga, dentro de Manaus.
    const areaProxima = {
      p_oeste: -60.29, p_sul: -3.29, p_leste: -60.19, p_norte: -3.19, p_zoom: 15,
    };
    const brasilInteiro = {
      p_oeste: -75.0, p_sul: -34.0, p_leste: -34.0, p_norte: 6.0, p_zoom: 4,
    };

    // Primeira chamada aquece os planos; as seguintes sao as medidas.
    await chamar(areaProxima);
    await chamar(brasilInteiro);

    const medidasPontos = [await chamar(areaProxima), await chamar(areaProxima), await chamar(areaProxima)];
    const medidasContagem = [await chamar(brasilInteiro), await chamar(brasilInteiro)];

    const mediana = (valores: number[]): number =>
      [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)];

    const pontos = mediana(medidasPontos);
    const contagem = mediana(medidasContagem);

    console.log(`[desempenho] pontos (zoom 15): ${medidasPontos.join(', ')} ms`);
    console.log(`[desempenho] contagem por municipio (zoom 4): ${medidasContagem.join(', ')} ms`);

    expect(pontos, `carga de pontos levou ${pontos} ms`).toBeLessThan(LIMITE_CONSULTA_MS);
    expect(contagem, `contagem por municipio levou ${contagem} ms`).toBeLessThan(LIMITE_CONSULTA_MS);
  });

  test('o mapa com 50 mil locais na base continua fluido', async ({ page }) => {
    await prepararPagina(page);
    const conta = await criarConta('perf-mapa');

    // A area da carga, onde a densidade de marcadores e maxima.
    await definirAreaInicial(page, { lat: -3.0, lng: -60.0, zoom: 13 });

    const inicio = Date.now();
    await entrarEAbrirMapa(page, conta);
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 30_000 });
    const ateOMapa = Date.now() - inicio;

    console.log(`[desempenho] primeiro mapa com marcadores: ${ateOMapa} ms`);

    // Com agrupamento, a tela nunca recebe milhares de nos de uma vez.
    const marcadores = await page.locator('.leaflet-marker-icon').count();
    console.log(`[desempenho] nos de marcador na tela: ${marcadores}`);
    expect(marcadores).toBeGreaterThan(0);
    expect(marcadores, 'o agrupamento deve manter a tela com poucos nos').toBeLessThan(1200);

    // O mapa continua respondendo: arrastar e aproximar nao travam.
    const caixa = await page.locator('#mapa').boundingBox();
    const inicioInteracao = Date.now();

    await page.mouse.move(caixa!.x + caixa!.width / 2, caixa!.y + caixa!.height / 2);
    await page.mouse.down();
    await page.mouse.move(caixa!.x + caixa!.width / 4, caixa!.y + caixa!.height / 3, { steps: 10 });
    await page.mouse.up();

    await page.getByRole('button', { name: 'Zoom in' }).click();
    await esperarMapaPronto(page);
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 30_000 });

    const interacao = Date.now() - inicioInteracao;
    console.log(`[desempenho] arrastar + aproximar: ${interacao} ms`);
    expect(interacao, `a interacao levou ${interacao} ms`).toBeLessThan(15_000);

    // A ficha de um local abre normalmente com a base cheia. O local e
    // escolhido pelo id: clicar num marcador qualquer pegaria um agrupamento,
    // que aproxima o mapa em vez de abrir a ficha.
    const umLocal = await fetch(
      `${URL_SUPABASE}/rest/v1/locais?select=id&origem_id=like.carga/*&limit=1`,
      { headers: { apikey: CHAVE_SERVICO, Authorization: `Bearer ${CHAVE_SERVICO}` } },
    );
    const [{ id: localId }] = (await umLocal.json()) as Array<{ id: string }>;

    await abrirFichaDoLocal(page, localId);
    await expect(
      page.getByRole('dialog', { name: 'Ficha do local' }).getByText('Manaus (AM)'),
    ).toBeVisible();
  });

  test('o primeiro mapa com marcadores aparece em menos de 3 s em 4G', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'a emulacao de rede so existe no Chromium (CDP)');

    await prepararPagina(page);
    const conta = await criarConta('perf-4g');

    await definirAreaInicial(page, { lat: -3.0, lng: -60.0, zoom: 13 });

    // Entra primeiro, sem limite de banda: o que se mede e a abertura do mapa.
    await entrarEAbrirMapa(page, conta);

    // 4G comum: 4 Mbps de descida, 3 Mbps de subida, 100 ms de latencia.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 100,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput: (3 * 1024 * 1024) / 8,
    });

    const inicio = Date.now();
    await page.reload();
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 30_000 });
    const decorrido = Date.now() - inicio;

    console.log(`[desempenho] primeiro mapa com marcadores em 4G: ${decorrido} ms`);
    await cdp.detach();

    expect(decorrido, `o primeiro mapa levou ${decorrido} ms`).toBeLessThan(LIMITE_PRIMEIRO_MAPA_MS);
  });

  test('a carga por area nunca devolve mais de 3.000 pontos', async () => {
    const conta = await criarConta('perf-limite');
    const entrar = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: CHAVE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: conta.email, password: conta.senha }),
    });
    const { access_token: token } = (await entrar.json()) as { access_token: string };

    const resposta = await fetch(`${URL_SUPABASE}/rest/v1/rpc/locais_na_area`, {
      method: 'POST',
      headers: { apikey: CHAVE_ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_oeste: -60.31, p_sul: -3.31, p_leste: -59.58, p_norte: -2.55, p_zoom: 15, p_limite: 99_999,
      }),
    });

    const linhas = (await resposta.json()) as unknown[];
    expect(linhas).toHaveLength(3000);
  });
});
