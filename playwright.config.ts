import { defineConfig, devices } from '@playwright/test';

const PORTA = 4173;

export default defineConfig({
  testDir: './tests/e2e',
  // Recria o banco local antes da suite (ver tests/e2e/preparar-banco.ts).
  globalSetup: './tests/e2e/preparar-banco.ts',
  // Os testes compartilham um unico banco: rodam em serie para nao disputar
  // as mesmas contas e o mesmo interruptor de somente leitura.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  // Teste instavel conta como falha: nenhuma nova tentativa automatica.
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium-celular',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true },
    },
    {
      name: 'webkit-celular',
      use: { ...devices['Desktop Safari'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: 'chromium-computador',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'webkit-computador',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    },

    // Projetos do harness visual (tests/visual), usados durante o refinamento
    // estetico. Nao entram na suite normal: testDir os inclui, mas eles so
    // rodam quando o arquivo e pedido explicitamente.
    {
      name: 'visual-celular',
      testDir: './tests/visual',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: 'visual-computador',
      testDir: './tests/visual',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'visual-celular-escuro',
      testDir: './tests/visual',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        colorScheme: 'dark',
      },
    },
  ],

  // O build e feito por "npm run test:e2e" antes daqui: assim o servidor de
  // preview pode ser reaproveitado entre execucoes sem servir um build velho.
  webServer: {
    command: `npx vite preview --port ${PORTA} --strictPort`,
    url: `http://127.0.0.1:${PORTA}`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
