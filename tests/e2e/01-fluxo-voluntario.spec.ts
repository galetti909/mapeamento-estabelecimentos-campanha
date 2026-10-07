// ===========================================================================
// Fluxo completo do voluntario: inscricao, espera, liberacao pelo
// administrador, login, marcar local, agendar, ver agenda, cancelar.
// ===========================================================================
import { expect, test } from '@playwright/test';
import {
  CENTRO_SP, SENHA_PADRAO, abrirMenu, aviso, clicarNoMapa, criarConta, criarLocal,
  criarLocalImportado, definirPerfil, definirSomenteLeitura, entrar, entrarEAbrirMapa,
  abrirFichaDoLocal, definirAreaInicial, identificador, irPelaMenu,
  prepararPagina, statusDoLocal,
} from './ajuda.js';

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
  await definirSomenteLeitura(false);
});

test('inscricao cria conta aguardando e nenhuma outra tela fica acessivel', async ({ page }) => {
  const marca = identificador('insc');
  const email = `${marca}@teste.exemplo`;
  const nome = `Pessoa ${marca.slice(-8)}`;

  await page.goto('/');
  await page.getByRole('tab', { name: 'Inscrever-se' }).click();

  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Nome de exibição').fill(nome);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_PADRAO);
  await page.getByLabel('Repita a senha').fill(SENHA_PADRAO);

  // O aviso de privacidade precisa ser marcado.
  await page.getByRole('button', { name: 'Inscrever-se' }).click();
  await expect(page.getByText('Marque que você leu o aviso de privacidade.')).toBeVisible();

  await page.getByLabel('Li e entendi o aviso de privacidade.').check();
  await page.getByRole('button', { name: 'Inscrever-se' }).click();

  await expect(page.getByRole('heading', { name: 'Inscrição enviada' })).toBeVisible();

  // Ao entrar, so a tela de espera.
  await entrar(page, { email, senha: SENHA_PADRAO });
  await expect(page.getByRole('heading', { name: 'Sua conta está aguardando liberação' })).toBeVisible();
  await expect(page.locator('#mapa')).toHaveCount(0);
  await expect(page.locator('#cabecalho')).toBeHidden();

  // Nem forcando a rota na barra de enderecos.
  await page.goto('/#/admin/contas');
  await expect(page.getByRole('heading', { name: 'Sua conta está aguardando liberação' })).toBeVisible();
  await page.goto('/#/meus-agendamentos');
  await expect(page.getByRole('heading', { name: 'Sua conta está aguardando liberação' })).toBeVisible();
});

test('conta recusada e conta bloqueada veem a tela de conta nao liberada', async ({ page }) => {
  const recusada = await criarConta('recusada', 'recusado');
  await entrar(page, recusada);
  await expect(page.getByRole('heading', { name: 'Sua conta não está liberada' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();

  const bloqueada = await criarConta('bloqueada', 'bloqueado');
  await entrar(page, bloqueada);
  await expect(page.getByRole('heading', { name: 'Sua conta não está liberada' })).toBeVisible();
});

test('o administrador libera a conta e o voluntario passa a usar o mapa', async ({ page }) => {
  const pendente = await criarConta('pendente', 'aguardando');
  const admin = await criarConta('admin-libera', 'ativo', 'admin');

  // Antes: tela de espera.
  await entrar(page, pendente);
  await expect(page.getByRole('heading', { name: 'Sua conta está aguardando liberação' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();

  // O administrador libera pela area de contas.
  await entrarEAbrirMapa(page, admin);
  await irPelaMenu(page, 'Contas', 'Contas');

  await page.locator('#admin-busca').fill(pendente.email);
  const linha = page.locator('.lista > li', { hasText: pendente.email });
  await expect(linha).toBeVisible();
  await linha.getByRole('button', { name: 'Liberar', exact: true }).click();
  await expect(aviso(page, /liberada/i)).toBeVisible();

  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();

  // Depois: mapa disponivel.
  await entrarEAbrirMapa(page, pendente);
  await expect(page.locator('#mapa')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar local' })).toBeVisible();
});

test('o voluntario marca um local, se agenda, ve a agenda e cancela', async ({ page }) => {
  const conta = await criarConta('voluntario');
  const nomeLocal = `Feira ${identificador('loc').slice(-12)}`;

  await entrarEAbrirMapa(page, conta);

  // Marcar local: entra no modo, toca no mapa, preenche o formulario.
  await page.getByRole('button', { name: 'Marcar local' }).click();
  await expect(page.getByText('Toque no mapa para posicionar o local.')).toBeVisible();
  await clicarNoMapa(page);

  await expect(page.getByRole('heading', { name: 'Marcar local' })).toBeVisible();
  await page.getByLabel('Nome do local').fill(nomeLocal);
  await page.getByLabel('Tipo').selectOption('feira');
  await page.getByLabel('Melhor horário (opcional)').fill('Sábados de manhã');
  await page.getByRole('button', { name: 'Salvar local' }).click();

  await expect(aviso(page, /já aparece no mapa/i)).toBeVisible();

  // A ficha do local abre com os dados gravados.
  await expect(page.getByRole('dialog', { name: 'Ficha do local' })).toBeVisible();
  const ficha = page.getByRole('dialog', { name: 'Ficha do local' });
  await expect(ficha.getByRole('heading', { name: nomeLocal })).toBeVisible();
  await expect(ficha.getByText('São Paulo (SP)')).toBeVisible();
  await expect(ficha.getByText('Sábados de manhã')).toBeVisible();
  await expect(ficha.getByText('Ninguém se agendou')).toBeVisible();

  // Me agendar.
  await ficha.getByRole('button', { name: 'Me agendar' }).click();
  await ficha.getByLabel('Das').fill('09:00');
  await ficha.getByLabel('Às').fill('11:00');
  await ficha.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await expect(aviso(page, /Agendamento confirmado/i)).toBeVisible();

  // A agenda mostra o proprio nome de exibicao.
  await expect(ficha.getByText('09:00–11:00')).toBeVisible();
  await expect(ficha.getByText(conta.nome)).toBeVisible();

  // Meus agendamentos lista o agendamento e permite cancelar.
  await irPelaMenu(page, 'Meus agendamentos', 'Meus agendamentos');
  const item = page.locator('.lista > li', { hasText: nomeLocal });
  await expect(item).toBeVisible();
  await expect(item.getByText('09:00–11:00')).toBeVisible();

  await item.getByRole('button', { name: 'Cancelar' }).click();
  await expect(aviso(page, /Agendamento cancelado/i)).toBeVisible();
  await expect(page.getByText('Você não tem agendamentos futuros.')).toBeVisible();
});

test('a agenda mostra o nome de exibicao de outra pessoa, e so isso', async ({ page }) => {
  const dona = await criarConta('dona-agenda');
  const outra = await criarConta('outra-agenda');
  const nomeLocal = `Praça ${identificador('ag').slice(-12)}`;
  const localId = await criarLocal(nomeLocal, dona.id);

  // A dona se agenda.
  await entrarEAbrirMapa(page, dona);
  await abrirFichaDoLocal(page, localId);
  const ficha = page.getByRole('dialog', { name: 'Ficha do local' });
  await ficha.getByRole('button', { name: 'Me agendar' }).click();
  await ficha.getByLabel('Das').fill('14:00');
  await ficha.getByLabel('Às').fill('16:00');
  await ficha.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await expect(aviso(page, /Agendamento confirmado/i)).toBeVisible();

  await ficha.getByRole('button', { name: 'Fechar ficha do local' }).click();
  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();

  // A outra pessoa ve o nome de exibicao, mas nao pode cancelar.
  await entrarEAbrirMapa(page, outra);
  await abrirFichaDoLocal(page, localId);
  const fichaOutra = page.getByRole('dialog', { name: 'Ficha do local' });
  await expect(fichaOutra.getByText(dona.nome)).toBeVisible();
  await expect(fichaOutra.getByText('14:00–16:00')).toBeVisible();
  await expect(fichaOutra.getByText(dona.email)).toHaveCount(0);
  await expect(fichaOutra.locator('.lista > li').getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
});

test('o voluntario nao ve Editar nem Arquivar no local de outra pessoa', async ({ page }) => {
  const dona = await criarConta('dona-local');
  const outra = await criarConta('intrusa');
  const nomeLocal = `Mercado ${identificador('mk').slice(-12)}`;
  const localId = await criarLocal(nomeLocal, dona.id);

  await entrarEAbrirMapa(page, outra);
  await abrirFichaDoLocal(page, localId);
  const ficha = page.getByRole('dialog', { name: 'Ficha do local' });
  await expect(ficha.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(ficha.getByRole('button', { name: 'Arquivar' })).toHaveCount(0);
  await expect(ficha.getByRole('button', { name: 'Me agendar' })).toBeVisible();
});

test('o autor edita e arquiva o proprio local', async ({ page }) => {
  const conta = await criarConta('autor');
  const nomeLocal = `Bar ${identificador('bar').slice(-12)}`;
  const localId = await criarLocal(nomeLocal, conta.id);

  await entrarEAbrirMapa(page, conta);
  await abrirFichaDoLocal(page, localId);
  const ficha = page.getByRole('dialog', { name: 'Ficha do local' });

  await ficha.getByRole('button', { name: 'Editar' }).click();
  await ficha.getByLabel('Nome do local').fill(`${nomeLocal} (editado)`);
  await ficha.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(aviso(page, /Local atualizado/i)).toBeVisible();
  await expect(ficha.getByRole('heading', { name: `${nomeLocal} (editado)` })).toBeVisible();

  await ficha.getByRole('button', { name: 'Arquivar' }).click();
  await ficha.getByRole('button', { name: 'Arquivar local' }).click();
  await expect(ficha.getByText('Escreva o motivo do arquivamento')).toBeVisible();

  await ficha.getByLabel('Motivo do arquivamento').fill('o local fechou');
  await ficha.getByRole('button', { name: 'Arquivar local' }).click();
  await expect(aviso(page, /Nada foi apagado/i)).toBeVisible();

  expect(await statusDoLocal(localId)).toBe('arquivado');
  await expect(ficha.getByText('Local arquivado')).toBeVisible();
  await expect(ficha.getByText('o local fechou')).toBeVisible();
});

test('o voluntario ativa um local importado', async ({ page }) => {
  const conta = await criarConta('ativador');
  const nomeLocal = `Feira Importada ${identificador('imp').slice(-10)}`;
  const localId = await criarLocalImportado(nomeLocal, `node/${Date.now()}`);

  await entrarEAbrirMapa(page, conta);

  // A camada de importados comeca desligada.
  const botaoImportados = page.getByRole('button', { name: 'Importados' });
  await expect(botaoImportados).toHaveAttribute('aria-pressed', 'false');
  await botaoImportados.click();
  await expect(botaoImportados).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(800);

  await abrirFichaDoLocal(page, localId);
  const ficha = page.getByRole('dialog', { name: 'Ficha do local' });
  await expect(ficha.getByText('OpenStreetMap')).toBeVisible();

  await ficha.getByRole('button', { name: 'Ativar este local' }).click();
  await expect(aviso(page, /Local ativado/i)).toBeVisible();
  expect(await statusDoLocal(localId)).toBe('ativo');
});

test('o modo somente leitura tira a escrita do voluntario', async ({ page }) => {
  const conta = await criarConta('leitura');
  const nomeLocal = `Padaria ${identificador('pad').slice(-12)}`;
  const localId = await criarLocal(nomeLocal, conta.id);

  await definirSomenteLeitura(true);
  try {
    await entrarEAbrirMapa(page, conta);

    await expect(page.locator('#faixa-somente-leitura')).toBeVisible();
    await expect(page.locator('#faixa-somente-leitura')).toContainText('Somente leitura');
    await expect(page.getByRole('button', { name: 'Marcar local' })).toBeHidden();

    await abrirFichaDoLocal(page, localId);
    const ficha = page.getByRole('dialog', { name: 'Ficha do local' });
    await expect(ficha.getByRole('button', { name: 'Me agendar' })).toHaveCount(0);
    await expect(ficha.getByText('somente para leitura')).toBeVisible();
  } finally {
    await definirSomenteLeitura(false);
  }
});

test('a troca de senha e obrigatoria quando o administrador define uma temporaria', async ({ page }) => {
  const conta = await criarConta('senha-temp');
  await definirPerfil(conta.id, { trocar_senha: true });

  await entrar(page, conta);

  await expect(page.getByRole('heading', { name: 'Escolha uma nova senha' })).toBeVisible();
  await expect(page.getByText('Um administrador definiu uma senha temporária')).toBeVisible();

  // Nenhuma outra tela antes da troca.
  await page.goto('/#/mapa');
  await expect(page.getByRole('heading', { name: 'Escolha uma nova senha' })).toBeVisible();

  const novaSenha = 'nova-senha-bem-longa-9';
  await page.getByLabel('Nova senha', { exact: true }).fill(novaSenha);
  await page.getByLabel('Repita a nova senha').fill(novaSenha);
  await page.getByRole('button', { name: 'Trocar senha' }).click();

  await expect(aviso(page, /Senha trocada/i)).toBeVisible();
  await expect(page.locator('#mapa')).toBeVisible({ timeout: 20000 });

  // A senha nova funciona e a troca nao e mais pedida.
  await abrirMenu(page);
  await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
  await entrarEAbrirMapa(page, { email: conta.email, senha: novaSenha });
  await expect(page.getByRole('heading', { name: 'Escolha uma nova senha' })).toHaveCount(0);
});

test('as regras de conduta e os creditos do mapa estao no app', async ({ page }) => {
  const conta = await criarConta('regras');
  await entrarEAbrirMapa(page, conta);

  // Credito do OpenStreetMap visivel no mapa.
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');

  await irPelaMenu(page, 'Regras de conduta', 'Regras de conduta');
  await expect(page.getByText(/cartazes/i)).toBeVisible();
  await expect(page.getByText(/bens de uso comum/i)).toBeVisible();
  await expect(page.getByText(/Não registre dados de pessoas/i)).toBeVisible();
  await expect(page.getByText(/locais reais e públicos/i)).toBeVisible();
  await expect(page.getByText(/respeite quem não quiser/i)).toBeVisible();
  await expect(page.getByText(/ODbL/i)).toBeVisible();
  await expect(page.getByText(/IBGE/i)).toBeVisible();
  await expect(page.getByText('© colaboradores do OpenStreetMap')).toBeVisible();
});

test('o formulario avisa antes de enviar dado pessoal', async ({ page }) => {
  const conta = await criarConta('dado-pessoal');
  await entrarEAbrirMapa(page, conta);

  await page.getByRole('button', { name: 'Marcar local' }).click();
  await clicarNoMapa(page);

  await page.getByLabel('Nome do local').fill('Feira Boa');
  await page.getByLabel('Observações (opcional)').fill('falar com joao@exemplo.org');
  await page.getByRole('button', { name: 'Salvar local' }).click();

  await expect(page.getByText('Não registre telefone, CPF ou e-mail de pessoas.').first()).toBeVisible();

  await page.getByLabel('Observações (opcional)').fill('ligue (11) 91234-5678');
  await page.getByRole('button', { name: 'Salvar local' }).click();
  await expect(page.getByText('Não registre telefone, CPF ou e-mail de pessoas.').first()).toBeVisible();

  // Sem dado pessoal, o envio passa.
  await page.getByLabel('Observações (opcional)').fill('Muito movimento perto das bancas.');
  await page.getByRole('button', { name: 'Salvar local' }).click();
  await expect(aviso(page, /já aparece no mapa/i)).toBeVisible();
});

test('marcar fora do Brasil e recusado pelo banco', async ({ page }) => {
  const conta = await criarConta('fora-brasil');

  // Buenos Aires: fora de qualquer municipio da malha.
  await definirAreaInicial(page, { lat: -34.6037, lng: -58.3816, zoom: 13 });
  await entrarEAbrirMapa(page, conta);

  await page.getByRole('button', { name: 'Marcar local' }).click();
  await clicarNoMapa(page);
  await page.getByLabel('Nome do local').fill('Bar Portenho');
  await page.getByRole('button', { name: 'Salvar local' }).click();

  await expect(aviso(page, /território brasileiro/i)).toBeVisible();
});

test.afterAll(async () => {
  await definirSomenteLeitura(false);
});

void CENTRO_SP;
