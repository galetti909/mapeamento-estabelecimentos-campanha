# Mapa de Campanha

Aplicativo web em que eleitores voluntários marcam num mapa do Brasil inteiro
os locais com circulação de pessoas e se agendam para ir conversar nesses
lugares. Qualquer pessoa se inscreve com e-mail, mas só usa o app depois que um
administrador libera a conta.

O grupo é formado por eleitores engajados, não pela campanha oficial.

---

## Como rodar localmente

Pré-requisitos: **Node 20+**, **Docker** em execução e **Git**.

```bash
npm install
npx supabase start          # sobe Postgres + PostGIS, Auth, PostgREST e Edge Functions
cp .env.example .env        # preencha com os valores de "npx supabase status"
npm run dev                 # http://127.0.0.1:5173
```

O `npx supabase start` aplica as migrations de `supabase/migrations` e o
`supabase/seed.sql`, que carrega **uma amostra de dez municípios** da malha do
IBGE. É o bastante para desenvolver e para toda a suíte de testes; a malha
nacional (5.570 municípios) é carregada só em produção.

Para criar um administrador no ambiente local:

```bash
ADMIN_SENHA=uma-senha-bem-longa npm run criar-admin -- --email voce@exemplo.org --nome "Seu Nome"
```

---

## Testes

| Comando | O que roda |
| --- | --- |
| `npm run test:db` | Recria o banco e roda os testes pgTAP (acesso por papel e status) |
| `npm run test:unit` | Vitest: validações, datas, mapeamento de tags, CSV, scripts e **API REST chamada direto** |
| `npm run build && npm run test:build` | Build e verificação do bundle publicado |
| `npm run test:e2e` | Playwright em Chromium e WebKit, em tela de celular (390×844) e de computador |
| `npm run test:all` | Tudo acima, na ordem |

`npm run test:e2e` recria o banco antes de começar
(`tests/e2e/preparar-banco.ts`). Para reaproveitar o banco durante o
desenvolvimento, use `MAPA_PULAR_RESET=1 npx playwright test`.

Os testes não dependem de rede externa: as respostas da Overpass API e a malha
do IBGE vêm de `tests/fixtures`, e os tiles do mapa são interceptados.

### Dependências dos navegadores

```bash
npx playwright install chromium webkit
sudo npx playwright install-deps          # bibliotecas do sistema (pede root)
```

O WebKit **não roda sem o segundo comando**: ele instala `libwoff2dec`,
`libharfbuzz-icu`, `libenchant-2`, `libhyphen`, `libsecret-1`, `libGLESv2`,
`libx264` e outras.

---

## Como publicar

A ordem importa: **criar a conta do administrador antes de divulgar o link.**

### 1. Supabase

1. Criar o projeto na região **São Paulo (`sa-east-1`)** e ativar a extensão
   `postgis`.
2. Vincular a CLI e aplicar as migrations:
   ```bash
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```
3. Em **Authentication → Providers → Email**: provedor ligado, **"Confirm
   email" desligado**, inscrições abertas, tamanho mínimo de senha **10**.
   Nenhum template de e-mail em uso — o app não envia e-mail nenhum.
4. Em **Authentication → Rate Limits**: manter o limite de inscrições por IP.
5. Publicar a Edge Function com a chave de serviço como **segredo** (nunca como
   variável do site):
   ```bash
   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<chave-de-servico>
   npx supabase functions deploy admin-usuarios
   ```
6. Carregar a malha municipal do IBGE (roda uma vez, ~5.570 municípios):
   ```bash
   npm run carregar-municipios
   ```
7. Criar o administrador inicial. A senha é digitada no terminal e não fica em
   arquivo nenhum:
   ```bash
   npm run criar-admin
   ```
8. **Só então** divulgar o link.

### 2. Front-end (Netlify)

1. Conectar o repositório. O `netlify.toml` já traz `npm run build`, a pasta
   `dist` e os cabeçalhos de segurança.
2. Em **Site configuration → Environment variables**, cadastrar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   A chave anon pode ser pública: quem protege os dados é o RLS do Postgres.
   A chave de serviço **nunca** entra aqui.
3. A Content-Security-Policy é gerada no build em `dist/_headers`, a partir da
   URL do Supabase (ver `vite.config.ts`).

---

## Operação

### Backup diário

```bash
npm run exportar                      # gera CSVs em exportacao/<data>/
npm run exportar -- --pasta /caminho  # ou numa pasta escolhida
```

Guarde os arquivos **fora do Supabase**: é a defesa contra uma conta de
administrador comprometida. Nenhuma senha, nem hash de senha, sai na exportação.

### Importar uma região nova

Conforme o grupo chega a uma cidade:

```bash
npm run importar-osm -- --municipio 3550308            # um município (código IBGE)
npm run importar-osm -- --municipio 3550308,3509502    # vários
npm run importar-osm -- --uf SP                        # uma UF inteira, um município por vez
npm run importar-osm -- --municipio 3550308 --dry-run  # confere sem gravar
```

Tudo entra como **`importado`**, numa camada separada e desligada por padrão no
mapa, e só vira local ativo quando um voluntário o ativa. Rodar de novo não
cria duplicatas e **nunca** devolve a `importado` um local já ativado ou
arquivado.

O script respeita as regras do Overpass: uma consulta por vez, pausa de 2 s
entre municípios, `timeout:90`, `User-Agent` com nome do projeto e contato
(`OSM_CONTATO` no `.env`) e nova tentativa com espera crescente em 429 e 504.

Listas de dados abertos (feiras livres de prefeituras, por exemplo):

```bash
npm run importar-csv -- --arquivo feiras-sp.csv
```

Colunas esperadas: `nome, tipo, lat, lng, endereco, id_externo`.

### Em caso de ataque

1. **Controle → Ligar modo somente leitura.** Nenhum voluntário escreve;
   administradores continuam.
2. **Contas →** bloquear as contas suspeitas (individual ou em lote).
3. **Contas → Arquivar locais da conta**, com o motivo.
4. **Histórico →** revisar o que mudou e usar **Restaurar esta versão**.

Nada é apagado em momento nenhum: locais são arquivados, agendamentos
cancelados, e o histórico só aceita inserções.

### Senha esquecida

O app não envia e-mails. A pessoa pede a um administrador por fora do app; o
administrador define uma senha temporária em **Contas → Senha temporária**, e a
pessoa é obrigada a trocá-la no próximo login.

### Encerramento

Depois de **25/10/2026**, em até 30 dias:

```bash
npm run exportar -- --sem-dados-pessoais
```

Em seguida, ligar o modo somente leitura, apagar o projeto no Supabase e o site
no Netlify.

---

## Estrutura

```
/src                       front-end (TypeScript puro)
  /lib                     cliente Supabase, validações, datas, DOM, mapa
  /telas                   entrar, aguardando, mapa, ficha, formulário, admin, regras
/supabase/migrations       tipos, tabelas, índices, funções, RLS, triggers
/supabase/functions/admin-usuarios   Edge Function (senha temporária)
/supabase/tests            testes pgTAP de acesso por papel e status
/scripts                   carregar-municipios, importar-osm, importar-csv,
                           criar-admin, exportar
/tests/unit                Vitest
/tests/e2e                 Playwright
/tests/fixtures            respostas gravadas do Overpass, amostra da malha do IBGE
/tests/build               verificação do bundle publicado
```

---

## Decisões que valem registrar

### O fundo do mapa não é mais o CARTO

A especificação previa o **CARTO Voyager sem chave** e mandava conferir os
termos antes de publicar. **Conferido em 06/10/2026: não serve mais.** O CARTO
passou a exigir chave de API nos tiles raster — sem chave, cada tile volta com
a marca "API KEY REQUIRED" (confirmado baixando um tile de São Paulo). O plano
gratuito também ficou limitado a 1 milhão de tiles por mês para uso comercial
e 5 milhões para não comercial.

Seguindo a alternativa prevista na própria especificação ("outro provedor
gratuito que aceite uso com crédito, trocando só uma URL no código"), o padrão
passou a ser a **camada padrão do OpenStreetMap**, que não exige chave e pede
apenas o crédito visível. A política de uso do OSMF permite um aplicativo
comunitário deste porte desde que o crédito fique visível, o cache do navegador
seja respeitado, não haja download em massa nem pré-carga de áreas, e o acesso
seja por HTTPS — as quatro condições são cumpridas.

Trocar de provedor é mexer em `src/lib/mapa-base.ts` (`TILES_URL`,
`TILES_CREDITO`) e no domínio em `vite.config.ts` (`DOMINIO_TILES`, que entra
na CSP). Se o dono do projeto preferir o CARTO, basta uma chave de API.

### O e-mail não fica em tabela exposta

O e-mail vive só em `auth.users`. Administradores o leem pela função
`admin_listar_contas()`; nenhum voluntário alcança o e-mail de ninguém.

### A agenda só mostra o nome de exibição

`agenda_do_local()` devolve `id`, `dia`, `hora_inicio`, `hora_fim`,
`nome_exibicao` e se o agendamento é seu. Nenhuma outra informação de outro
usuário sai do banco. Pela tabela `agendamentos`, cada voluntário lê apenas os
próprios (o administrador lê todos, porque precisa cancelar e exportar).

### Toda escrita passa por função

`INSERT`, `UPDATE` e `DELETE` estão revogados para `anon` e `authenticated` em
todas as tabelas. Toda escrita passa por uma função `SECURITY DEFINER` com
`search_path` fixo, que confere login, status da conta, modo somente leitura,
papel, autoria e limite diário — nessa ordem — e registra no histórico.

### As políticas de RLS usam `(select ...)`

Cada chamada de função nas políticas vai dentro de `(select ...)`, o que faz o
Postgres avaliá-la **uma vez por consulta** em vez de uma vez por linha. Sem
isso, uma carga de mapa com 50 mil locais chamava `conta_ativa()` 50 mil vezes
e a consulta levava mais de 400 ms; com a mudança, leva cerca de 30 ms.
