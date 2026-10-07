// ===========================================================================
// Seguranca no front-end e acessibilidade.
// ===========================================================================
import { expect, test } from '@playwright/test';
import {
  abrirFichaDoLocal, abrirMenu, aviso, criarConta, criarLocal,
  entrarEAbrirMapa, identificador, irPelaMenu, prepararPagina,
} from './ajuda.js';

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
});

test('nome de local com <script> aparece como texto, nao como elemento', async ({ page }) => {
  const conta = await criarConta('injecao');
  const nomeMalicioso = '<script>window.fuiInjetado=1</script>';
  const localId = await criarLocal(nomeMalicioso, conta.id);

  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));

  await entrarEAbrirMapa(page, conta);
  await abrirFichaDoLocal(page, localId);

  const ficha = page.getByRole('dialog', { name: 'Ficha do local' });
  await expect(ficha.getByRole('heading', { name: nomeMalicioso })).toBeVisible();

  // O script nao rodou e nenhum elemento <script> foi criado pelo texto.
  expect(await page.evaluate(() => (window as unknown as { fuiInjetado?: number }).fuiInjetado)).toBeUndefined();
  expect(await ficha.locator('script').count()).toBe(0);
  expect(erros).toEqual([]);

  // O mesmo vale para o titulo do marcador no mapa.
  await ficha.getByRole('button', { name: 'Fechar ficha do local' }).click();
  expect(await page.locator('#mapa script').count()).toBe(0);
});

test('HTML em observacoes, endereco e nome de exibicao tambem fica como texto', async ({ page }) => {
  const conta = await criarConta('injecao2');
  const localId = await criarLocal('Local para injecao', conta.id);

  await entrarEAbrirMapa(page, conta);
  await abrirFichaDoLocal(page, localId);
  const ficha = page.getByRole('dialog', { name: 'Ficha do local' });

  await ficha.getByRole('button', { name: 'Editar' }).click();
  await ficha.getByLabel('Endereço (opcional)').fill('<img src=x onerror="window.viaImg=1">');
  await ficha.getByLabel('Observações (opcional)').fill('<b>negrito</b> e <iframe src="http://x"></iframe>');
  await ficha.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(aviso(page, /Local atualizado/i)).toBeVisible();

  await expect(ficha.getByText('<img src=x onerror="window.viaImg=1">')).toBeVisible();
  await expect(ficha.getByText('<b>negrito</b> e <iframe src="http://x"></iframe>')).toBeVisible();
  expect(await ficha.locator('img, iframe, b').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { viaImg?: number }).viaImg)).toBeUndefined();
});

test('o app nao carrega script de terceiro nenhum', async ({ page }) => {
  const conta = await criarConta('terceiros');

  const externos: string[] = [];
  page.on('request', (pedido) => {
    const url = new URL(pedido.url());
    const tipo = pedido.resourceType();
    const proprio = url.port === '4173' || url.hostname === '127.0.0.1';
    if (!proprio && (tipo === 'script' || tipo === 'stylesheet' || tipo === 'font')) {
      externos.push(`${tipo} ${pedido.url()}`);
    }
  });

  await entrarEAbrirMapa(page, conta);
  await irPelaMenu(page, 'Regras de conduta', 'Regras de conduta');

  expect(externos, `scripts/estilos de terceiros carregados: ${externos.join(', ')}`).toEqual([]);
});

test('a chave de servico nao aparece em nenhum arquivo servido', async ({ page }) => {
  const conta = await criarConta('sem-chave');
  const corpos: string[] = [];

  page.on('response', async (resposta) => {
    const tipo = resposta.headers()['content-type'] ?? '';
    if (!/javascript|html|css|json/.test(tipo)) return;
    if (!resposta.url().includes(':4173')) return;
    try {
      corpos.push(await resposta.text());
    } catch {
      // Resposta sem corpo legivel.
    }
  });

  await entrarEAbrirMapa(page, conta);

  const juntos = corpos.join('\n');
  expect(juntos.length).toBeGreaterThan(1000);
  expect(juntos).not.toContain('service_role');
  expect(juntos).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  expect(juntos).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
});

test('a sessao fica guardada no aparelho e o mapa lembra a ultima area', async ({ page }) => {
  const conta = await criarConta('sessao');
  await entrarEAbrirMapa(page, conta);

  const guardada = await page.evaluate(() => localStorage.getItem('mapa-de-campanha-area'));
  expect(guardada).toBeTruthy();
  const area = JSON.parse(guardada as string) as { lat: number; lng: number; zoom: number };
  expect(area.zoom).toBeGreaterThan(3);

  // Recarregar mantem a sessao e a area.
  await page.reload();
  await expect(page.locator('#mapa')).toBeVisible();
  const depois = JSON.parse((await page.evaluate(() => localStorage.getItem('mapa-de-campanha-area'))) as string);
  expect(Math.abs(depois.lat - area.lat)).toBeLessThan(0.2);
});

test('os formularios tem rotulo, foco visivel e navegacao por teclado', async ({ page }) => {
  await page.goto('/');

  // Todo campo da tela de entrada tem rotulo associado.
  const semRotulo = await page.evaluate(() => {
    const entradas = [...document.querySelectorAll('input, select, textarea')];
    return entradas
      .filter((e) => {
        const id = e.getAttribute('id');
        const temLabel = id ? document.querySelector(`label[for="${id}"]`) !== null : false;
        return !temLabel && !e.getAttribute('aria-label');
      })
      .map((e) => e.outerHTML.slice(0, 80));
  });
  expect(semRotulo).toEqual([]);

  // O formulario e percorrido e enviado pelo teclado.
  const conta = await criarConta('teclado');
  await page.getByLabel('E-mail').focus();
  await page.keyboard.type(conta.email);
  await page.keyboard.press('Tab');
  await page.keyboard.type(conta.senha);
  await page.keyboard.press('Enter');

  await expect(page.locator('#mapa')).toBeVisible({ timeout: 20000 });
});

test('alvos de toque tem pelo menos 44 px em tela de celular', async ({ page }, infos) => {
  test.skip(!infos.project.name.includes('celular'), 'vale para a tela de celular');

  const conta = await criarConta('toque');
  await entrarEAbrirMapa(page, conta);

  const pequenos = await page.evaluate(() => {
    const alvos = [
      ...document.querySelectorAll('#cabecalho button, .mapa-barra button, .botao-marcar'),
    ];
    return alvos
      .filter((a) => {
        const caixa = a.getBoundingClientRect();
        return caixa.width > 0 && (caixa.width < 44 || caixa.height < 44);
      })
      .map((a) => `${a.className} ${Math.round(a.getBoundingClientRect().width)}x${Math.round(a.getBoundingClientRect().height)}`);
  });

  expect(pequenos, `alvos abaixo de 44 px: ${pequenos.join(', ')}`).toEqual([]);
});

test('o menu fecha com Escape e tem o item atual marcado', async ({ page }) => {
  const conta = await criarConta('menu');
  await entrarEAbrirMapa(page, conta);

  await abrirMenu(page);
  await expect(page.locator('#menu').getByRole('link', { name: 'Mapa' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false');
});

test('a pagina tem titulo, idioma e um unico h1', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Mapa de Campanha');
  expect(await page.getAttribute('html', 'lang')).toBe('pt-BR');

  const conta = await criarConta('estrutura');
  await entrarEAbrirMapa(page, conta);
  expect(await page.locator('h1').count()).toBe(1);
});

test('os filtros do mapa funcionam pelo teclado', async ({ page }) => {
  const conta = await criarConta('filtros');
  const nomeUnico = `Feira Filtro ${identificador('ff').slice(-10)}`;
  // No centro do retangulo do Rio de Janeiro: a busca por municipio
  // centraliza o mapa ali, e o marcador fica dentro da area visivel.
  await criarLocal(nomeUnico, conta.id, { lat: -22.91, lng: -43.45 }, 'feira');

  await entrarEAbrirMapa(page, conta);

  await page.getByRole('button', { name: 'Filtros' }).click();
  await expect(page.locator('.painel-filtros')).toBeVisible();

  await page.getByLabel('UF').selectOption('RJ');
  // "Município" tambem casa com a caixa "Buscar local ou município": usa o id.
  await expect(page.locator('#filtro-municipio')).toBeEnabled();
  await page.locator('#filtro-municipio').selectOption({ label: 'Rio de Janeiro' });

  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.locator('.painel-filtros')).toBeHidden();

  // A busca por municipio leva o mapa para la.
  await page.locator('#mapa-busca').fill('Rio de Janeiro');
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 20000 });
});

test('o botao "Onde estou" usa a localizacao somente no aparelho', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -23.5505, longitude: -46.6333 });

  const conta = await criarConta('onde-estou');

  const enviosComCoordenada: string[] = [];
  page.on('request', (pedido) => {
    const corpo = pedido.postData() ?? '';
    if (/-23\.5505|-46\.6333/.test(corpo) && !pedido.url().includes('locais_na_area')) {
      enviosComCoordenada.push(`${pedido.url()} ${corpo.slice(0, 120)}`);
    }
  });

  await entrarEAbrirMapa(page, conta);
  await page.getByRole('button', { name: 'Onde estou' }).click();

  // O mapa se move para a posicao do aparelho.
  await expect.poll(async () => {
    const area = JSON.parse((await page.evaluate(() => localStorage.getItem('mapa-de-campanha-area'))) as string);
    return Math.abs(area.lat - -23.5505) < 0.05;
  }, { timeout: 15000 }).toBe(true);

  // Nada com a localizacao exata foi enviado ao servidor fora da carga do mapa.
  expect(enviosComCoordenada).toEqual([]);
});
