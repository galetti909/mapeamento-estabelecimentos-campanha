// ===========================================================================
// Harness visual: percorre todas as telas e grava uma imagem de cada uma.
// Nao e um teste de regressao; existe para olhar o app durante o refinamento.
//   npx playwright test --project=visual-celular tests/visual/capturar.spec.ts
// As imagens ficam em tests/visual/telas/.
// ===========================================================================
import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  abrirFichaDoLocal, abrirMenu, criarConta, criarLocal, criarLocalImportado,
  criarPedidoLimite, definirPerfil, definirSomenteLeitura, entrar, entrarEAbrirMapa,
  identificador, irPelaMenu, prepararPagina, type ContaTeste,
} from '../e2e/ajuda.js';

const PASTA = 'tests/visual/telas';

async function tirar(page: Page, nome: string, sufixo: string): Promise<void> {
  await page.waitForTimeout(350); // deixa transicoes terminarem
  await page.screenshot({ path: `${PASTA}/${nome}-${sufixo}.png`, fullPage: false });
}

test.describe('telas do app', () => {
  test.describe.configure({ timeout: 180_000 });

  let admin: ContaTeste;
  let voluntario: ContaTeste;
  let localId: string;

  test.beforeAll(async () => {
    await mkdir(PASTA, { recursive: true });
    await definirSomenteLeitura(false);
  });

  test('captura', async ({ page }, infos) => {
    const sufixo = infos.project.name.replace('visual-', '');
    await prepararPagina(page);
    // Deixa os tiles reais chegarem: o objetivo aqui e ver o mapa como ele e.
    await page.unroute('**/tile.openstreetmap.org/**');

    admin = await criarConta('visual-adm', 'ativo', 'admin');
    voluntario = await criarConta('visual-vol');
    const pendente = await criarConta('visual-pendente', 'aguardando');
    await criarPedidoLimite(pendente.id);

    localId = await criarLocal(`Feira da Praça ${identificador('v').slice(-6)}`, voluntario.id);
    await criarLocalImportado(`Mercado Municipal ${identificador('v').slice(-6)}`, `node/v${Date.now()}`);
    for (let i = 0; i < 6; i += 1) {
      await criarLocal(`Ponto de encontro ${i + 1}`, voluntario.id, { lat: -23.55 + i * 0.002, lng: -46.63 + i * 0.002 });
    }

    // 1. Entrar
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Entrar' })).toBeVisible();
    await tirar(page, '01-entrar', sufixo);

    // 2. Inscrever-se
    await page.getByRole('tab', { name: 'Inscrever-se' }).click();
    await tirar(page, '02-inscrever', sufixo);

    // 3. Aguardando liberacao
    await entrar(page, pendente);
    await expect(page.getByRole('heading', { name: /aguardando libera/i })).toBeVisible();
    await tirar(page, '03-aguardando', sufixo);
    await page.getByRole('button', { name: 'Sair' }).click();

    // 4. Mapa
    await entrarEAbrirMapa(page, voluntario);
    await tirar(page, '04-mapa', sufixo);

    // 5. Filtros
    await page.getByRole('button', { name: 'Filtros' }).click();
    await tirar(page, '05-filtros', sufixo);
    await page.getByRole('button', { name: 'Fechar' }).click();

    // 6. Menu
    await abrirMenu(page);
    await tirar(page, '06-menu', sufixo);
    await page.keyboard.press('Escape');

    // 7. Ficha do local
    await abrirFichaDoLocal(page, localId);
    await tirar(page, '07-ficha', sufixo);

    // 8. Agendamento
    const ficha = page.getByRole('dialog', { name: 'Ficha do local' });
    await ficha.getByRole('button', { name: 'Me agendar' }).click();
    await tirar(page, '08-agendar', sufixo);
    await ficha.getByLabel('Das').fill('09:00');
    await ficha.getByLabel('Às').fill('11:00');
    await ficha.getByRole('button', { name: 'Confirmar agendamento' }).click();
    await expect(page.locator('.aviso-flutuante')).toBeVisible();
    await tirar(page, '09-ficha-com-agenda', sufixo);
    await ficha.getByRole('button', { name: 'Fechar ficha do local' }).click();

    // 10. Formulario de local
    // Abrir uma ficha deixa a rota em #/mapa/<id> e centraliza o mapa ali.
    // Voltar para #/mapa e recarregar fecha a ficha e devolve a area livre
    // que prepararPagina define, onde nao ha marcador sob o clique.
    await page.goto('/#/mapa');
    await page.reload();
    await expect(page.locator('#mapa')).toBeVisible();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Marcar local' }).click();
    const caixa = await page.locator('#mapa').boundingBox();
    await page.mouse.click(caixa!.x + caixa!.width / 2, caixa!.y + caixa!.height / 2);
    await expect(page.getByLabel('Nome do local')).toBeVisible();
    await tirar(page, '10-formulario-local', sufixo);

    // 11. Erro de validacao
    await page.getByLabel('Nome do local').fill('X');
    await page.getByLabel('Observações (opcional)').fill('ligue (11) 91234-5678');
    await page.getByRole('button', { name: 'Salvar local' }).click();
    await tirar(page, '11-formulario-erro', sufixo);
    await page.getByRole('button', { name: 'Fechar formulário' }).click();

    // 12. Meus agendamentos
    await irPelaMenu(page, 'Meus agendamentos', 'Meus agendamentos');
    await tirar(page, '12-meus-agendamentos', sufixo);

    // 13. Regras
    await irPelaMenu(page, 'Regras de conduta', 'Regras de conduta');
    await tirar(page, '13-regras', sufixo);

    // 14. Trocar senha
    await irPelaMenu(page, 'Trocar minha senha', /senha/i);
    await tirar(page, '14-trocar-senha', sufixo);

    await abrirMenu(page);
    await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();

    // --- administrador
    await entrarEAbrirMapa(page, admin);

    // 15. Contas
    await irPelaMenu(page, 'Contas', 'Contas');
    await tirar(page, '15-admin-contas', sufixo);

    // 16. Pedidos de limite
    await irPelaMenu(page, 'Pedidos de limite', 'Pedidos de limite');
    await tirar(page, '16-admin-pedidos', sufixo);

    // 17. Historico
    await irPelaMenu(page, 'Histórico', 'Histórico');
    await tirar(page, '17-admin-historico', sufixo);

    // 18. Controle
    await irPelaMenu(page, 'Controle', 'Controle');
    await tirar(page, '18-admin-controle', sufixo);

    // 19. Faixa de somente leitura
    await page.getByRole('button', { name: 'Ligar modo somente leitura' }).click();
    await expect(page.locator('#faixa-somente-leitura')).toBeVisible();
    await tirar(page, '19-somente-leitura', sufixo);
    await page.getByRole('button', { name: 'Desligar modo somente leitura' }).click();

    // 20. Senha temporaria obrigatoria
    await definirPerfil(voluntario.id, { trocar_senha: true });
    await abrirMenu(page);
    await page.locator('#menu').getByRole('button', { name: 'Sair' }).click();
    await entrar(page, voluntario);
    await expect(page.getByRole('heading', { name: /nova senha/i })).toBeVisible();
    await tirar(page, '20-senha-obrigatoria', sufixo);
    await definirPerfil(voluntario.id, { trocar_senha: false });
  });
});
