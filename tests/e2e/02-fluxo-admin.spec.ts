// ===========================================================================
// Fluxo do administrador: liberar e recusar em lote, aprovar pedido de
// limite, arquivar os locais de uma conta, restaurar uma versao e ligar o
// modo somente leitura.
// ===========================================================================
import { expect, test } from '@playwright/test';
import {
  abrirFichaDoLocal, abrirMenu, aviso, clicarNoMapa, contarLocaisDaConta, criarConta, criarLocal,
  criarPedidoLimite, definirPerfil, definirSomenteLeitura, entrar, entrarEAbrirMapa,
  identificador, irPelaMenu, nomeDoLocal, prepararPagina, statusDoLocal,
} from './ajuda.js';

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
  await definirSomenteLeitura(false);
});

test.afterAll(async () => {
  await definirSomenteLeitura(false);
});

test('o administrador libera e recusa contas em lote', async ({ page }) => {
  const admin = await criarConta('adm-lote', 'ativo', 'admin');
  const marca = identificador('lote');

  const pendentes = [
    await criarConta(`${marca}-a`, 'aguardando'),
    await criarConta(`${marca}-b`, 'aguardando'),
    await criarConta(`${marca}-c`, 'aguardando'),
  ];

  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Contas', 'Contas');

  // Filtra pelas tres contas deste teste e libera todas de uma vez.
  await page.locator('#admin-busca').fill(marca);
  for (const conta of pendentes) {
    await expect(page.locator('.lista > li', { hasText: conta.email })).toBeVisible();
  }
  await expect(page.locator('.lista > li')).toHaveCount(3);

  await page.getByLabel(/Selecionar todas/).check();
  await page.getByRole('button', { name: /^Liberar 3$/ }).click();
  await expect(aviso(page, /3 conta\(s\) atualizada\(s\)/)).toBeVisible();
  await expect(page.getByText('Nenhuma conta com este status.')).toBeVisible();

  // As tres contas passam a entrar.
  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrarEAbrirMapa(page, pendentes[0]);
  await expect(page.locator('#mapa')).toBeVisible();

  // Agora o lote de recusa, sobre contas novas.
  const marcaRecusa = identificador('recusa');
  const recusar = [
    await criarConta(`${marcaRecusa}-a`, 'aguardando'),
    await criarConta(`${marcaRecusa}-b`, 'aguardando'),
  ];

  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Contas', 'Contas');
  await page.locator('#admin-busca').fill(marcaRecusa);
  for (const conta of recusar) {
    await expect(page.locator('.lista > li', { hasText: conta.email })).toBeVisible();
  }
  await expect(page.locator('.lista > li')).toHaveCount(2);

  await page.getByLabel(/Selecionar todas/).check();
  await page.getByRole('button', { name: /^Recusar 2$/ }).click();
  await expect(aviso(page, /2 conta\(s\) atualizada\(s\)/)).toBeVisible();

  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrar(page, recusar[0]);
  await expect(page.getByRole('heading', { name: 'Sua conta não está liberada' })).toBeVisible();
});

test('o contador do menu mostra as contas e os pedidos aguardando', async ({ page }) => {
  const admin = await criarConta('adm-contador', 'ativo', 'admin');
  await criarConta(identificador('aguarda'), 'aguardando');

  await entrarEAbrirMapa(page, admin);

  const contador = page.locator('#contador-admin');
  await expect(contador).toBeVisible();
  const total = Number((await contador.textContent()) ?? '0');
  expect(total).toBeGreaterThan(0);

  await abrirMenu(page);
  await expect(page.locator('#menu').getByRole('link', { name: /Contas/ })).toBeVisible();
});

test('o administrador aprova um pedido de liberacao de limite', async ({ page }) => {
  const admin = await criarConta('adm-limite', 'ativo', 'admin');
  const voluntario = await criarConta('pede-limite');

  // O voluntario chega ao limite: dez locais marcados hoje.
  for (let i = 0; i < 10; i += 1) {
    await criarLocal(`Limite ${identificador('lim').slice(-10)}-${i}`, voluntario.id);
  }

  await entrarEAbrirMapa(page, voluntario);
  await expect(page.getByText('0 de 10 marcações hoje')).toBeVisible();

  // O formulario mostra o limite e o botao de pedido.
  await page.getByRole('button', { name: 'Marcar local' }).click();
  await clicarNoMapa(page);

  const painel = page.getByRole('dialog', { name: 'Marcar novo local' });
  await expect(painel.getByText('Você chegou ao limite de 10 locais por hoje.')).toBeVisible();
  await expect(painel.getByLabel('Nome do local')).toHaveCount(0);

  await painel.getByRole('button', { name: 'Pedir liberação do limite' }).click();
  await expect(aviso(page, /Pedido enviado/i)).toBeVisible();

  // O administrador aprova.
  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Pedidos de limite', 'Pedidos de limite');

  const pedido = page.locator('.lista > li', { hasText: voluntario.nome });
  await expect(pedido).toBeVisible();
  await expect(pedido.getByText(/10 marcados hoje/)).toBeVisible();
  await pedido.getByRole('button', { name: 'Aprovar' }).click();
  await expect(aviso(page, /sem limite diário/i)).toBeVisible();

  // O voluntario passa a marcar sem limite.
  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrarEAbrirMapa(page, voluntario);
  await expect(page.getByText('Sem limite diário')).toBeVisible();

  await page.getByRole('button', { name: 'Marcar local' }).click();
  await clicarNoMapa(page);
  await page.getByLabel('Nome do local').fill(`Sem limite ${identificador('sl').slice(-10)}`);
  await page.getByRole('button', { name: 'Salvar local' }).click();
  await expect(aviso(page, /já aparece no mapa/i)).toBeVisible();
});

test('o administrador recusa um pedido de limite', async ({ page }) => {
  const admin = await criarConta('adm-recusa-lim', 'ativo', 'admin');
  const voluntario = await criarConta('pede-recusado');
  await definirPerfil(voluntario.id, { sem_limite: false });

  // O pedido ja existe; o que este teste cobre e a recusa pelo administrador.
  await criarPedidoLimite(voluntario.id);

  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Pedidos de limite', 'Pedidos de limite');

  const pedido = page.locator('.lista > li', { hasText: voluntario.nome });
  await expect(pedido).toBeVisible();
  await pedido.getByRole('button', { name: 'Recusar' }).click();
  await expect(aviso(page, /recusado/i)).toBeVisible();
  await expect(page.locator('.lista > li', { hasText: voluntario.nome })).toHaveCount(0);
});

test('o administrador arquiva todos os locais de uma conta', async ({ page }) => {
  const admin = await criarConta('adm-massa', 'ativo', 'admin');
  const infiltrado = await criarConta('infiltrado');
  const inocente = await criarConta('inocente');

  const marca = identificador('massa');
  for (let i = 0; i < 4; i += 1) {
    await criarLocal(`${marca} falso ${i}`, infiltrado.id);
  }
  const localInocente = await criarLocal(`${marca} legitimo`, inocente.id);

  expect(await contarLocaisDaConta(infiltrado.id)).toBe(4);

  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Contas', 'Contas');
  await page.getByRole('tab', { name: 'Ativas' }).click();
  await page.locator('#admin-busca').fill(infiltrado.email);

  const linha = page.locator('.lista > li', { hasText: infiltrado.email });
  await expect(linha).toContainText('4 locais ativos');
  await linha.getByRole('button', { name: /Mais ações/ }).click();
  await page.getByRole('menuitem', { name: 'Arquivar locais da conta' }).click();

  await page.getByLabel('Motivo do arquivamento').fill('conta usada para sabotagem do mapa');
  await page.getByRole('button', { name: 'Arquivar todos os locais da conta' }).click();
  await expect(aviso(page, /4 local\(is\) arquivado\(s\)/)).toBeVisible();

  expect(await contarLocaisDaConta(infiltrado.id)).toBe(0);
  expect(await statusDoLocal(localInocente)).toBe('ativo');

  // E bloqueia a conta.
  await page.locator('#admin-busca').fill(infiltrado.email);
  const linhaDepois = page.locator('.lista > li', { hasText: infiltrado.email });
  await linhaDepois.getByRole('button', { name: 'Bloquear' }).click();
  await expect(aviso(page, /Bloqueada/i)).toBeVisible();

  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrar(page, infiltrado);
  await expect(page.getByRole('heading', { name: 'Sua conta não está liberada' })).toBeVisible();
});

test('o administrador restaura uma versao do historico', async ({ page }) => {
  const admin = await criarConta('adm-restaura', 'ativo', 'admin');
  const autora = await criarConta('autora-hist');

  const nomeOriginal = `Original ${identificador('hist').slice(-10)}`;
  const localId = await criarLocal(nomeOriginal, autora.id);

  // A autora edita o local, mudando o nome.
  await entrarEAbrirMapa(page, autora);
  await abrirFichaDoLocal(page, localId);
  const ficha = page.getByRole('dialog', { name: 'Ficha do local' });
  await ficha.getByRole('button', { name: 'Editar' }).click();
  await ficha.getByLabel('Nome do local').fill('Nome Trocado');
  await ficha.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(aviso(page, /Local atualizado/i)).toBeVisible();
  expect(await nomeDoLocal(localId)).toBe('Nome Trocado');

  // O administrador encontra a versao no historico e restaura.
  await ficha.getByRole('button', { name: 'Fechar ficha do local' }).click();
  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Histórico', 'Histórico');

  await page.getByRole('group').getByText('Filtros').click();
  await page.getByLabel('Identificador do registro').fill(localId);
  await page.getByRole('button', { name: 'Filtrar' }).click();

  // A linha mais antiga e a criacao do local, com o nome original.
  const linhas = page.locator('.lista > li');
  await expect(linhas.first()).toContainText('Local editado');
  const criacao = linhas.last();
  await expect(criacao).toContainText(nomeOriginal);

  await criacao.getByRole('button', { name: 'Restaurar esta versão' }).click();
  await expect(aviso(page, /Local restaurado/i)).toBeVisible();

  expect(await nomeDoLocal(localId)).toBe(nomeOriginal);
});

test('o administrador liga e desliga o modo somente leitura', async ({ page }) => {
  const admin = await criarConta('adm-leitura', 'ativo', 'admin');
  const voluntario = await criarConta('vol-leitura');

  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Controle', 'Controle');
  await expect(page.getByText('O modo somente leitura está desligado.')).toBeVisible();

  await page.getByRole('button', { name: 'Ligar modo somente leitura' }).click();
  await expect(aviso(page, /ligado/i)).toBeVisible();
  await expect(page.getByText('O modo somente leitura está LIGADO.')).toBeVisible();
  await expect(page.locator('#faixa-somente-leitura')).toBeVisible();

  // O voluntario perde a escrita.
  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrarEAbrirMapa(page, voluntario);
  await expect(page.locator('#faixa-somente-leitura')).toContainText('Somente leitura');
  await expect(page.getByRole('button', { name: 'Marcar local' })).toBeHidden();

  // O administrador continua escrevendo.
  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrarEAbrirMapa(page, admin);
  await expect(page.getByRole('button', { name: 'Marcar local' })).toBeVisible();

  await page.getByRole('button', { name: 'Marcar local' }).click();
  await clicarNoMapa(page);
  await page.getByLabel('Nome do local').fill(`Admin escreve ${identificador('ae').slice(-10)}`);
  await page.getByRole('button', { name: 'Salvar local' }).click();
  await expect(aviso(page, /já aparece no mapa/i)).toBeVisible();

  // Desliga.
  await page.getByRole('button', { name: 'Fechar ficha do local' }).click();
  await irPelaMenu(page, 'Controle', 'Controle');
  await page.getByRole('button', { name: 'Desligar modo somente leitura' }).click();
  await expect(aviso(page, /desligado/i)).toBeVisible();
  await expect(page.locator('#faixa-somente-leitura')).toBeHidden();
});

test('o administrador define uma senha temporaria', async ({ page }) => {
  const admin = await criarConta('adm-senha', 'ativo', 'admin');
  const esquecida = await criarConta('esqueceu');

  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Contas', 'Contas');
  await page.getByRole('tab', { name: 'Ativas' }).click();
  await page.locator('#admin-busca').fill(esquecida.email);

  const linha = page.locator('.lista > li', { hasText: esquecida.email });
  await linha.getByRole('button', { name: /Mais ações/ }).click();
  await page.getByRole('menuitem', { name: 'Senha temporária' }).click();

  const temporaria = 'temporaria-123456';
  await page.getByLabel(/Senha temporária para/).fill(temporaria);
  await page.getByRole('button', { name: 'Definir senha temporária' }).click();
  await expect(aviso(page, /Senha temporária definida/i)).toBeVisible();

  // A pessoa entra com a temporaria e e obrigada a trocar.
  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrar(page, { email: esquecida.email, senha: temporaria });
  await expect(page.getByRole('heading', { name: 'Escolha uma nova senha' })).toBeVisible();
});

test('o voluntario nao alcanca a area do administrador', async ({ page }) => {
  const voluntario = await criarConta('sem-poder');
  await entrarEAbrirMapa(page, voluntario);

  await abrirMenu(page);
  await expect(page.locator('#menu').getByRole('link', { name: /Contas/ })).toHaveCount(0);
  await expect(page.locator('#menu').getByRole('link', { name: /Histórico/ })).toHaveCount(0);
  await expect(page.locator('#menu').getByRole('link', { name: /Controle/ })).toHaveCount(0);
  await expect(page.locator('#contador-admin')).toBeHidden();

  // Forcar a rota devolve ao mapa.
  await page.goto('/#/admin/contas');
  await expect(page.locator('#mapa')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contas' })).toHaveCount(0);

  await page.goto('/#/admin/historico');
  await expect(page.locator('#mapa')).toBeVisible();
});

test('o administrador nao altera a propria conta', async ({ page }) => {
  const admin = await criarConta('adm-si', 'ativo', 'admin');

  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Contas', 'Contas');
  await page.getByRole('tab', { name: 'Ativas' }).click();
  await page.locator('#admin-busca').fill(admin.email);

  const linha = page.locator('.lista > li', { hasText: admin.email });
  await expect(linha).toContainText('(você)');
  await expect(linha).toContainText('Você não altera a própria conta.');
  await expect(linha.getByRole('button', { name: 'Bloquear' })).toHaveCount(0);
  await expect(linha.getByRole('button', { name: /Mais ações/ })).toHaveCount(0);
});
