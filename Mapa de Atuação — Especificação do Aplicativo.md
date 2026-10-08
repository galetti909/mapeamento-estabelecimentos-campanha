# Mapa de Campanha — Especificação do Aplicativo

Oct 5, 2026 · @João Galetti

## Visão geral

O Mapa de Campanha é um aplicativo web em que eleitores voluntários marcam num mapa do Brasil inteiro os locais com circulação de pessoas e se agendam para ir conversar nesses lugares. Qualquer pessoa pode se inscrever com e-mail, mas só usa o app depois que um administrador libera a conta. O grupo é formado por eleitores engajados, não pela campanha oficial.

**Objetivos**

- Mostrar num mapa nacional os locais com circulação de pessoas (feiras, praças, comércios, bares, terminais).
- Deixar qualquer usuário liberado marcar novos locais e se agendar para ir a eles.
- Mostrar em cada local quem já se agendou para ir e quando.
- Impedir que alguém sabote o mapa: contas liberadas à mão, limite diário de marcações, nada apagado de verdade, histórico de tudo e restauração pelo administrador.

**Usuários e escala**

- Um administrador no início (`joaogaletti@gmail.com`), que pode promover outros.
- Voluntários em todo o Brasil; o sistema deve aguentar dezenas de milhares de locais e alguns milhares de contas.
- A base é preenchida aos poucos, região por região.
- Uso principal no celular, muitas vezes em rede móvel fraca.

**Sem interação entre usuários:** não há mensagens, comentários, seguidores nem página de perfil. O único dado de outra pessoa que um usuário vê é o nome de exibição de quem se agendou num local.

**Sem e-mails automáticos:** o app não envia nenhum e-mail. Os administradores veem as contas aguardando liberação e entram em contato por fora, se quiserem.

## Escopo

O escopo cobre inscrição com liberação manual, mapa nacional, marcação de locais, agenda por local, administração e histórico. Tudo que envolve dados de eleitores, envio de e-mails ou interação entre usuários fica de fora.

**Dentro do escopo**

- Inscrição com e-mail, senha e nome de exibição; conta aguardando liberação até um administrador aprovar.
- Login com e-mail e senha.
- Mapa do Brasil com camadas (locais ativos, locais importados) e filtros por UF, município e tipo.
- Marcação de novos locais por qualquer usuário liberado, com limite de 10 por dia.
- Pedido de liberação do limite, que o administrador aprova e deixa o usuário sem limite.
- Agenda por local: cada usuário se agenda e vê quem mais se agendou para aquele local.
- Edição e arquivamento pelo autor do local; edição, arquivamento e restauração de qualquer local pelo administrador.
- Histórico imutável de alterações.
- Administração: contas aguardando liberação, bloqueio de contas, promoção a administrador, pedidos de limite, arquivamento em massa dos locais de uma conta, troca de senha de um usuário, modo somente leitura.
- Importação de locais do OpenStreetMap e de CSV de dados abertos, por região, feita aos poucos pelo administrador.
- Página com as regras de conduta.

**Fora do escopo**

- Qualquer envio de e-mail (confirmação, recuperação de senha, avisos).
- Mensagens, comentários, curtidas, seguidores ou página pública de perfil.
- Dados das pessoas abordadas (nome, telefone, endereço, opinião política).
- Google Maps ou Google Places, por causa dos termos de uso.
- Acesso público sem login.
- Rastreamento da localização dos voluntários. O botão "onde estou" funciona só no aparelho.
- Aplicativo nativo ou instalável.

**Regras de conduta mostradas no app**

- Não colar cartazes ou adesivos em estabelecimentos, que contam como bens de uso comum pela lei eleitoral.
- Não registrar dados de pessoas nos textos do app.
- Marcar só locais reais e públicos.
- Conversar com quem quiser conversar e respeitar quem não quiser.

## Stack e arquitetura

O app é uma página estática em React e TypeScript que conversa direto com o Supabase. Quem protege os dados é o banco, com Row Level Security e funções, e não o front-end.

| Camada | Tecnologia | Por quê |
| --- | --- | --- |
| Front-end | React 19 + TypeScript, componentes shadcn/ui (Radix + Tailwind CSS v4); Vite para empacotar | Componentes acessíveis e visual padronizado, ainda abaixo de 200 KB iniciais |
| Mapa | Leaflet 1.9 + Leaflet.markercluster | Biblioteca de mapa simples; o agrupamento aguenta dezenas de milhares de pontos |
| Imagens do mapa (tiles) | CARTO Voyager, sem chave | Explicado abaixo |
| Banco | Supabase Postgres com PostGIS | Consultas por área e identificação de UF e município pela posição |
| Login | Supabase Auth com e-mail e senha, confirmação de e-mail desligada | Nenhum e-mail é enviado |
| Regras de acesso | RLS + funções RPC em SQL | Toda escrita passa por uma função que confere conta, papel e limite |
| Ações de administrador que exigem a chave de serviço | Supabase Edge Function `admin-usuarios` | Trocar senha de um usuário; a chave nunca vai ao navegador |
| Importação | Scripts TypeScript (Node 20) rodados pelo administrador | Overpass API e CSV, gravando com a chave de serviço |
| Hospedagem | Netlify ou Vercel, plano gratuito | Site estático com HTTPS |
| Testes | Vitest, Playwright e pgTAP | Cada regra de acesso e cada fluxo têm teste automatizado |

**O que é provedor de tiles**

O Leaflet só desenha os marcadores. O fundo do mapa (ruas, rios, nomes de bairros) vem em pequenas imagens quadradas, os *tiles*, servidas por um provedor. O padrão aqui é o CARTO Voyager, que não exige chave e mostra o crédito "© OpenStreetMap © CARTO". Antes de publicar, o agente deve conferir os termos de uso atuais do CARTO para esse volume; se não servirem, a alternativa é outro provedor gratuito que aceite uso com crédito, trocando só uma URL no código.

**Chaves e variáveis**

- Front-end: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. A chave anon pode ser pública, porque o RLS protege os dados.
- Scripts e Edge Function: `SUPABASE_SERVICE_ROLE_KEY`, só no `.env` local do administrador e nos segredos da Edge Function. Nunca no repositório nem no navegador.
- `.env` entra no `.gitignore` desde o primeiro commit; `.env.example` lista as variáveis sem valores.

&#91;embedded content: arquitetura · navegador, Supabase e scripts do administrador\]

A chave de serviço existe só na Edge Function e no computador do administrador; tudo que sai do navegador passa pelo RLS e pelas funções do Postgres.

## Contas, papéis e permissões

Qualquer pessoa se inscreve, mas a conta só funciona depois que um administrador libera. Existem dois papéis, administrador e voluntário, e um voluntário só altera o que ele mesmo marcou.

**Inscrição e liberação**

1. A pessoa informa e-mail, senha (mínimo de 10 caracteres) e nome de exibição (2 a 40 caracteres). Nenhum e-mail é enviado.
2. A conta nasce com status `aguardando`. Ao entrar, a pessoa vê só a mensagem "Sua conta está aguardando liberação. Um administrador vai analisar o pedido."
3. Os administradores veem a lista de contas aguardando, com e-mail, nome e data, e liberam ou recusam. O contato com a pessoa, se houver, é feito por fora do app.
4. Uma conta liberada pode ser bloqueada depois, e uma bloqueada ou recusada pode ser liberada de novo.

&#91;embedded content: ciclo de vida de uma conta · 4 status\]

Toda mudança de status é feita por um administrador; a própria pessoa só consegue se inscrever.

**Primeiro administrador**

Como o e-mail não é confirmado, qualquer um poderia se inscrever com o e-mail de outra pessoa. Por isso o primeiro administrador não é definido pelo e-mail na inscrição: o script `scripts/criar-admin.ts`, rodado com a chave de serviço logo depois da publicação e antes de divulgar o link, cria a conta `joaogaletti@gmail.com` com a senha digitada no terminal, já como administrador ativo. Novos administradores só surgem por promoção feita por um administrador.

**Limite diário de marcações**

- Cada voluntário cria ou ativa até 10 locais por dia (contagem pelo dia no fuso America/Sao\_Paulo).
- Ao atingir o limite, o app mostra o botão "Pedir liberação do limite". O pedido aparece para os administradores.
- Um administrador aprova ou recusa. Aprovado, o voluntário fica sem limite até que um administrador retire a liberação.
- Administradores não têm limite.

**Matriz de permissões**

| Ação | Administrador | Voluntário ativo | Aguardando, recusado, bloqueado ou sem login |
| --- | --- | --- | --- |
| Ver mapa, locais ativos e importados | Sim | Sim | Não |
| Ver a agenda de um local, com nomes de exibição | Sim | Sim | Não |
| Marcar novo local ou ativar um importado | Sem limite | 10 por dia, ou sem limite se liberado | Não |
| Editar local | Qualquer um | Só os que marcou ou ativou | Não |
| Arquivar local | Qualquer um | Só os que marcou ou ativou | Não |
| Restaurar local arquivado ou versão anterior | Sim | Não | Não |
| Agendar-se e cancelar o próprio agendamento | Sim | Sim | Não |
| Cancelar agendamento de outra pessoa | Sim | Não | Não |
| Ver histórico de alterações | Sim | Não | Não |
| Liberar, recusar, bloquear contas; promover a administrador | Sim | Não | Não |
| Aprovar pedido de liberação de limite | Sim | Pode pedir | Não |
| Trocar senha | De qualquer usuário | A própria | Não |
| Arquivar todos os locais de uma conta | Sim | Não | Não |
| Ligar o modo somente leitura | Sim | Não | Não |
| Rodar importação | Sim, pelo script | Não | Não |

**Proteções do papel de administrador**

- Não é possível bloquear, rebaixar ou recusar o último administrador ativo.
- Um administrador não bloqueia nem rebaixa a si mesmo.
- Toda mudança de status ou papel de conta fica no histórico.

**Senha esquecida:** como não há envio de e-mail, a pessoa pede a um administrador por fora do app. O administrador define uma senha temporária na tela de usuários, e o usuário é obrigado a trocá-la no próximo login.

## Modelo de dados

São sete tabelas no schema `public`, com PostGIS. A UF e o município de cada local são calculados pelo banco a partir da posição, e um ponto fora do Brasil é recusado.

**Tipos enumerados**

- `papel`: `admin`, `voluntario`
- `status_conta`: `aguardando`, `ativo`, `recusado`, `bloqueado`
- `status_local`: `importado`, `ativo`, `arquivado`
- `origem_local`: `osm`, `manual`, `dados_abertos`
- `tipo_local`: `feira`, `praca`, `parque`, `mercado`, `padaria`, `bar`, `cafe`, `restaurante`, `comercio`, `terminal`, `outro`
- `status_pedido`: `aberto`, `aprovado`, `recusado`

**perfis** (uma linha por usuário de `auth.users`, criada por trigger na inscrição)

| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | uuid, PK | Igual a `auth.users.id` |
| nome\_exibicao | text | 2 a 40 caracteres; único sem diferenciar maiúsculas |
| papel | papel | Padrão `voluntario` |
| status | status\_conta | Padrão `aguardando` |
| sem\_limite | boolean | Padrão `false` |
| trocar\_senha | boolean | `true` depois de senha temporária definida por administrador |
| decidido\_por, decidido\_em | uuid, timestamptz | Última liberação, recusa ou bloqueio |
| criado\_em | timestamptz |  |

O e-mail fica só em `auth.users`. Administradores o leem pela função `admin_listar_contas`, nunca por tabela exposta.

**municipios** (malha municipal do IBGE, carregada uma vez)

| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | int, PK | Código IBGE de 7 dígitos |
| nome | text |  |
| uf | char(2) |  |
| geom | geometry(MultiPolygon, 4326) | Simplificada; índice GIST |

**locais**

| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | uuid, PK | `gen_random_uuid()` |
| nome | text | 2 a 80 caracteres |
| tipo | tipo\_local |  |
| geom | geography(Point, 4326) | Obrigatório; índice GIST |
| municipio\_id | int | Preenchido por trigger com `ST_Contains`; sem município, o insert é recusado |
| uf | char(2) | Copiado do município pelo trigger |
| endereco | text | Até 160 caracteres |
| melhor\_horario | text | Até 80 caracteres |
| observacoes | text | Até 500 caracteres; bloqueia telefone, CPF e e-mail |
| status | status\_local |  |
| origem | origem\_local |  |
| origem\_id | text | Ex.: `node/123456`; único junto com `origem` quando preenchido |
| osm\_tags | jsonb | Só as tags usadas no mapeamento |
| criado\_por | uuid | Nulo para importados |
| ativado\_por, ativado\_em | uuid, timestamptz | Quem marcou ou ativou; base do limite diário |
| arquivado\_por, arquivado\_em, motivo\_arquivamento | uuid, timestamptz, text | Motivo obrigatório |
| criado\_em, atualizado\_em | timestamptz | `atualizado_em` por trigger |

Índices extras: `status`, `uf`, `municipio_id` e (`ativado_por`, `ativado_em`).

**agendamentos**

| Coluna | Tipo | Regras |
| --- | --- | --- |
| id | uuid, PK |  |
| local\_id | uuid | Local precisa estar `ativo` |
| perfil\_id | uuid | Sempre o próprio usuário |
| dia | date | De hoje até 60 dias à frente |
| hora\_inicio, hora\_fim | time | `hora_fim` maior que `hora_inicio` |
| cancelado\_em, cancelado\_por | timestamptz, uuid | Cancelamento em vez de exclusão |
| criado\_em | timestamptz |  |

Um usuário não pode ter dois agendamentos ativos sobrepostos no mesmo local e dia. Agendamentos não têm campo de texto livre.

**pedidos\_limite**: `id`, `perfil_id`, `status` (status\_pedido), `criado_em`, `decidido_por`, `decidido_em`. No máximo um pedido `aberto` por perfil.

**historico** (só recebe inserções): `id` bigserial, `tabela`, `registro_id`, `acao` (`insert`, `update` ou o nome da função RPC), `feito_por` (nulo para scripts), `feito_em`, `antes` jsonb, `depois` jsonb.

**config** (uma linha só): `somente_leitura boolean` (padrão `false`) e `limite_diario int` (padrão 10).

## Segurança e anti-boicote

O front-end só lê e chama funções; toda escrita passa por funções RPC que conferem status da conta, papel, autoria e limite diário. Nada é apagado: locais são arquivados, agendamentos cancelados, e o histórico guarda tudo.

**Princípios**

1. RLS ligado em todas as tabelas, negando tudo por padrão.
2. `INSERT`, `UPDATE` e `DELETE` revogados para `anon` e `authenticated` em todas as tabelas. Escrita só por funções `SECURITY DEFINER` com `search_path` fixo.
3. `historico` preenchido por trigger, com outro trigger que recusa `UPDATE` e `DELETE`.
4. O usuário anônimo não lê nenhuma tabela e não executa nenhuma função, exceto as do próprio Supabase Auth.
5. Conta que não esteja `ativo` não lê nem escreve nada; só consegue consultar o próprio status.

**Funções auxiliares**

- `conta_ativa()`: verdadeiro se o perfil de `auth.uid()` estiver `ativo`. Todas as políticas usam essa função, então bloquear uma conta corta o acesso na hora.
- `sou_admin()`: conta ativa com papel `admin`.
- `checar_escrita()`: lança erro se `config.somente_leitura` estiver ligado e o usuário não for administrador.
- `checar_limite()`: conta os locais com `ativado_por = auth.uid()` no dia corrente (fuso America/Sao\_Paulo) e lança `limite_diario_atingido` se chegar a `config.limite_diario`, exceto para `sem_limite` e administradores.

**Leitura (SELECT)**

- `locais`: contas ativas veem `ativo` e `importado`; veem também os próprios arquivados; administrador vê tudo.
- `agendamentos`: lidos só pela função `agenda_do_local(local_id)`, que devolve dia, horário e nome de exibição dos agendamentos não cancelados de hoje em diante. Nenhuma outra informação de outro usuário sai do banco.
- `perfis`: cada um lê o próprio; administrador lê todos pela função `admin_listar_contas`.
- `historico` e `pedidos_limite`: administrador lê tudo; voluntário lê só os próprios pedidos.
- `municipios` e `config`: leitura para contas ativas.

**Funções RPC de escrita**

| Função | Quem pode | O que valida |
| --- | --- | --- |
| `marcar_local(nome, tipo, lat, lng, endereco, melhor_horario, observacoes)` | Conta ativa | Limite diário; ponto dentro do Brasil; textos sem dados pessoais |
| `ativar_importado(id)` | Conta ativa | Só sobre `importado`; conta no limite diário |
| `editar_local(id, campos)` | Administrador; quem marcou ou ativou | Não altera status, origem nem autoria |
| `arquivar_local(id, motivo)` | Administrador; quem marcou ou ativou | Motivo obrigatório; cancela os agendamentos futuros do local |
| `restaurar_local(id, historico_id)` | Administrador | Volta ao estado gravado naquela linha do histórico |
| `agendar(local_id, dia, hora_inicio, hora_fim)` | Conta ativa | Local ativo; dia entre hoje e 60 dias; sem sobreposição |
| `cancelar_agendamento(id)` | Dono; administrador |  |
| `pedir_liberacao_limite()` | Conta ativa sem limite liberado | Um pedido aberto por vez |
| `admin_decidir_pedido(id, aprovar)` | Administrador | Aprovar liga `sem_limite` |
| `admin_definir_limite(perfil, sem_limite)` | Administrador |  |
| `admin_definir_status(perfil, status)` | Administrador | Não age sobre si mesmo nem sobre o último administrador |
| `admin_definir_papel(perfil, papel)` | Administrador | Mesmas proteções |
| `admin_arquivar_locais_da_conta(perfil, motivo)` | Administrador | Arquiva todos os locais ativos que a conta marcou ou ativou |
| `admin_somente_leitura(ligado)` | Administrador |  |
| `trocar_minha_senha_concluida()` | Conta ativa | Desliga `trocar_senha` depois que o usuário troca a senha pelo Supabase Auth |

Toda função de escrita chama `checar_escrita()` primeiro e registra uma linha em `historico`. A senha temporária é definida pela Edge Function `admin-usuarios`, que confirma que quem chama é administrador antes de usar a chave de serviço.

&#91;embedded content: ciclo de vida de um local · 3 status\]

Cada seta corresponde a uma função RPC da tabela acima; nenhuma transição tira um local do banco.

**Bloqueio de dados pessoais em textos**

Um `CHECK` em `nome`, `endereco`, `melhor_horario` e `observacoes` recusa padrões de telefone brasileiro, CPF e e-mail. O front repete a checagem para avisar antes do envio: "Não registre telefone, CPF ou e-mail de pessoas."

**Ameaças e defesas**

| Tentativa | Defesa |
| --- | --- |
| Inscrições falsas em massa | Contas nascem `aguardando` e não veem nada; administrador recusa em lote; limite de inscrições por IP no Supabase Auth |
| Alguém se inscreve com o e-mail do administrador | Conta do administrador criada por script antes de divulgar o link |
| Voluntário infiltrado marca pontos falsos | Limite de 10 por dia; administrador arquiva em massa os locais da conta e a bloqueia |
| Voluntário arquiva locais de outros | Só o autor ou o administrador arquiva |
| Chamada direta à API para burlar regras | Escrita direta revogada; funções conferem tudo |
| Alguém apaga dados | `DELETE` revogado; histórico imutável; restauração pelo administrador |
| Ataque em andamento | Modo somente leitura e bloqueio de contas |
| Exposição de quem vai a cada local | Só contas liberadas veem a agenda, e só o nome de exibição |
| Conta de administrador comprometida | Exportação diária fora do Supabase; senha forte; segundo administrador de confiança |
| Injeção de HTML em textos | O React escapa todo texto; nenhum `dangerouslySetInnerHTML`, e o HTML dos marcadores do mapa é fixo, sem dado do usuário; CSP restritiva |

## Importação e base geográfica

O mapa cobre o Brasil inteiro desde o início, mas os locais entram aos poucos: o administrador importa município por município quando o grupo chega a uma região, e os voluntários marcam o resto à mão. Tudo que é importado entra como `importado`, numa camada separada e desligada por padrão, e só vira local ativo quando alguém o ativa.

**1. Base de municípios: `scripts/carregar-municipios.ts`** (roda uma vez)

- Baixa a malha municipal do IBGE em GeoJSON (API de malhas do IBGE ou arquivo da malha municipal; o agente confirma a fonte e o formato atuais).
- Simplifica as geometrias (`ST_SimplifyPreserveTopology`, tolerância em torno de 0,001 grau) para manter as consultas leves.
- Grava os 5.570 municípios com código, nome e UF. Rodar de novo atualiza sem duplicar.

**2. Locais do OpenStreetMap: `scripts/importar-osm.ts`**

1. Recebe `--municipio <código IBGE>` (um ou vários) ou `--uf <sigla>`; com `--uf`, processa os municípios da UF um por um.
2. Para cada município, localiza a área no Overpass pela tag `IBGE:GEOCODIGO`, com o nome do município e a UF como alternativa.
3. Consulta com `out center tags`, usando o mapeamento abaixo.
4. Faz upsert em `locais` pela chave (`origem='osm'`, `origem_id`):
   - Se não existe: insere como `importado`.
   - Se existe e ainda está `importado`: atualiza nome, posição e tags.
   - Se já foi ativado ou arquivado: atualiza só `osm_tags` e nunca mexe no status.
5. Ignora elementos sem nome, exceto praças e feiras.
6. Grava um resumo por município (novos, atualizados, ignorados) e registra a importação no histórico.

Regras de uso do Overpass: uma consulta por vez, pausa de 2 s entre municípios, `timeout:90`, `User-Agent` com nome do projeto e contato, nova tentativa com espera crescente em caso de erro 429 ou 504. O script aceita `--dry-run`.

**Mapeamento de tags para `tipo_local`**

| Tag no OSM | tipo\_local |
| --- | --- |
| `amenity=marketplace` | feira |
| `place=square`, `leisure=square` | praca |
| `leisure=park` | parque |
| `shop=supermarket`, `shop=convenience` | mercado |
| `shop=bakery` | padaria |
| `amenity=bar`, `amenity=pub` | bar |
| `amenity=cafe` | cafe |
| `amenity=restaurant`, `amenity=fast_food` | restaurante |
| `amenity=bus_station`, `public_transport=station`, `railway=station` | terminal |
| demais `shop=*` | comercio |

**3. Dados abertos: `scripts/importar-csv.ts`**

Importa CSV com `nome, tipo, lat, lng, endereco, id_externo`, como listas de feiras livres de prefeituras. Os registros entram com `origem='dados_abertos'` e seguem as mesmas regras de upsert.

**Licença:** os dados do OpenStreetMap são ODbL e os do IBGE são públicos. O mapa mostra sempre o crédito "© colaboradores do OpenStreetMap", e a página de regras cita as fontes.

## Telas e fluxos

O voluntário usa basicamente o mapa e a ficha do local; o administrador tem uma área própria. Os botões mudam conforme o papel, mas o banco confere de novo em toda ação.

**1. Entrar e inscrever-se**

- Duas abas: "Entrar" (e-mail e senha) e "Inscrever-se" (e-mail, senha, confirmação de senha e nome de exibição).
- Na inscrição, aviso de privacidade: o que é guardado, que o nome de exibição aparece para outros voluntários nos agendamentos, e que a base é apagada depois da eleição. A pessoa marca que leu.
- Depois da inscrição ou ao entrar com conta não liberada: tela única "Sua conta está aguardando liberação". Para conta recusada ou bloqueada: "Sua conta não está liberada." Nenhuma outra tela fica acessível.
- Senha esquecida: texto explicando que é preciso pedir a um administrador.
- Se `trocar_senha` estiver ligado, a primeira tela depois do login é a troca de senha.

**2. Mapa (tela principal)**

- Mapa do Brasil em tela cheia, com agrupamento de marcadores e zoom inicial no Brasil inteiro (ou na última área vista, guardada no aparelho).
- Camadas: Locais ativos (ligada) e Importados (desligada, marcadores apagados).
- Cores dos pontos: vermelho para local ativo ainda não visitado; verde para local visitado, isto é, com pelo menos um agendamento não cancelado cujo horário já terminou (fuso de Brasília); cinza para importado. Os agrupamentos mostram o total e, no anel, a fração já visitada.
- Filtros: UF, município, tipo e "com agendamento nos próximos 7 dias".
- Busca por nome de local e por município.
- Botão "Onde estou", com a localização usada só no aparelho.
- Botão "Marcar local": a pessoa toca no mapa para posicionar e abre o formulário. Mostra quantas marcações restam no dia.
- Os locais são carregados por área visível com `locais_na_area(bbox)`, limitada a 3.000 por chamada; com zoom muito afastado, a função devolve contagens por município em vez de pontos.

**3. Ficha do local** (painel que sobe da parte de baixo)

- Nome, tipo, endereço, melhor horário, observações, município e UF, origem.
- Agenda: lista dos próximos agendamentos com dia, horário e nome de exibição, mais antigos primeiro.
- Ações: "Me agendar" (dia e faixa de horário), cancelar o próprio agendamento, "Ativar este local" (para importados), e Editar e Arquivar para o autor ou administrador.

**4. Formulário de local**

- Nome, tipo, endereço (opcional), melhor horário, observações.
- Mesmas validações do banco, com mensagens claras.
- Ao atingir o limite: "Você chegou ao limite de 10 locais por hoje" e o botão "Pedir liberação do limite".

**5. Meus agendamentos**

- Lista dos próprios agendamentos futuros, com atalho para a ficha do local e botão de cancelar.

**6. Área do administrador**

- **Contas:** abas Aguardando, Ativas, Recusadas e Bloqueadas, com e-mail, nome de exibição e data. Ações: liberar, recusar (individual ou em lote), bloquear, promover ou rebaixar, liberar ou retirar limite, definir senha temporária, arquivar todos os locais da conta.
- **Pedidos de limite:** lista dos pedidos abertos com quantos locais a pessoa marcou e quando; aprovar ou recusar.
- **Histórico:** lista filtrável por conta, local, ação e data, com o que mudou e o botão "Restaurar esta versão".
- **Controle:** interruptor do modo somente leitura (com faixa de aviso para todos) e botão "Exportar base (CSV)".
- Um contador no menu mostra quantas contas e pedidos estão aguardando.

**7. Regras de conduta**

- As regras da seção de escopo, as fontes de dados e os créditos dos mapas.

## Requisitos não funcionais

O app precisa abrir rápido num celular comum em 4G, aguentar a base nacional, guardar o mínimo de dados pessoais e ser apagado depois da eleição.

**Celular e desempenho**

- Layout pensado primeiro para 360 px de largura; alvos de toque com pelo menos 44 px.
- Primeiro mapa com marcadores visíveis em até 3 s numa conexão 4G.
- Pacote JavaScript inicial abaixo de 200 KB comprimido, sem contar o Leaflet.
- `locais_na_area(bbox, zoom)` é `SECURITY INVOKER`, respeita o RLS, devolve só as colunas do marcador e responde em menos de 300 ms com 50 mil locais na base.
- A ficha completa e a agenda são buscadas só ao abrir um local.

**Acessibilidade e idioma**

- Contraste mínimo AA, rótulos em todos os campos, foco visível e navegação por teclado nos formulários.
- Textos em português do Brasil; datas e horas no fuso America/Sao\_Paulo.

**LGPD e privacidade**

- Dados pessoais guardados: e-mail, senha (pelo Supabase Auth, com hash) e nome de exibição. Nenhum dado de eleitores.
- O nome de exibição aparece para outras contas liberadas só na agenda dos locais; o e-mail só para administradores.
- Aviso de privacidade aceito na inscrição.
- Sem analytics, pixels ou scripts de terceiros, exceto Leaflet e as imagens do mapa.
- Encerramento: até 30 dias depois de 25/10/2026, o administrador exporta o que quiser guardar, sem dados pessoais, e apaga o projeto do Supabase.

**Segurança no front-end**

- Nenhum dado do usuário inserido com `innerHTML`.
- Content-Security-Policy permitindo só o próprio domínio, o domínio do Supabase e o servidor de tiles.
- A chave de serviço nunca aparece no bundle; um teste de build procura por ela.
- Sessão expira após 7 dias sem uso.

**Licenças e créditos**

- Crédito do OpenStreetMap e do provedor de tiles sempre visível no mapa.

## Configuração, deploy e operação

O banco é versionado por migrations da Supabase CLI, e não há nenhum serviço de e-mail para configurar. A ordem de publicação importa: criar a conta do administrador antes de divulgar o link.

**Estrutura do repositório**

```
/src                         front-end (React + shadcn/ui)
/supabase/migrations         tipos, tabelas, índices, funções, RLS, triggers
/supabase/functions/admin-usuarios   Edge Function (senha temporária)
/supabase/tests              testes pgTAP de acesso por papel e status
/scripts                     carregar-municipios.ts, importar-osm.ts, importar-csv.ts,
                             criar-admin.ts, exportar.ts
/tests/unit                  Vitest
/tests/e2e                   Playwright
/tests/fixtures              respostas gravadas do Overpass, amostra da malha do IBGE
.env.example                 variáveis sem valores
```

**Supabase**

1. Criar o projeto na região São Paulo (`sa-east-1`) e ativar a extensão `postgis`.
2. Aplicar as migrations com a Supabase CLI.
3. Em Auth: provedor e-mail e senha ligado, "Confirm email" desligado, inscrições abertas, tamanho mínimo de senha 10, limite de inscrições por IP ativo, nenhum template de e-mail em uso.
4. Publicar a Edge Function `admin-usuarios` com a chave de serviço como segredo.
5. Rodar `scripts/carregar-municipios.ts`.
6. Rodar `scripts/criar-admin.ts` para criar `joaogaletti@gmail.com` como administrador.
7. Só então divulgar o link.

**Front-end**

- Deploy no Netlify ou Vercel a partir do repositório, com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis do site.
- Cabeçalhos de segurança (CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`) no arquivo de configuração do host.

**Operação**

- Backup: `scripts/exportar.ts` gera CSVs de todas as tabelas (sem senhas); o administrador roda uma vez por dia e guarda fora do Supabase.
- Importar novas regiões com `scripts/importar-osm.ts --municipio ...` conforme o grupo crescer.
- Em caso de ataque: ligar o modo somente leitura, bloquear as contas suspeitas, arquivar os locais delas, revisar o histórico e restaurar.

**Encerramento**

- Depois de 25/10/2026: ligar o modo somente leitura, exportar o que for útil sem dados pessoais e apagar o projeto do Supabase e o site em até 30 dias.

## Critérios de aceite

A entrega está completa quando todos os itens abaixo passam em testes automatizados, em três execuções seguidas sem falha. Os testes de acesso chamam a API REST diretamente, como um atacante faria, e não só pela interface.

**Contas**

- [ ] Inscrição cria conta `aguardando` sem enviar nenhum e-mail.
- [ ] Conta `aguardando`, `recusado` ou `bloqueado` não lê nenhuma tabela nem executa nenhuma função de escrita, mesmo chamando a API direto.
- [ ] Liberar uma conta dá acesso na chamada seguinte; bloquear corta na chamada seguinte.
- [ ] Inscrição com e-mail já usado é recusada, inclusive o do administrador.
- [ ] `criar-admin.ts` cria `joaogaletti@gmail.com` como administrador ativo; rodar de novo não duplica.
- [ ] Não é possível bloquear, rebaixar ou recusar o último administrador, nem a si mesmo.
- [ ] Senha temporária definida pelo administrador obriga troca no próximo login.
- [ ] Usuário sem login não lê nada.

**Locais e limite**

- [ ] O 11º local marcado ou ativado no mesmo dia por um voluntário é recusado com `limite_diario_atingido`.
- [ ] O limite reinicia à meia-noite de Brasília.
- [ ] Pedido de liberação aprovado deixa o voluntário sem limite; retirar a liberação volta ao limite.
- [ ] Administrador não tem limite.
- [ ] Ponto fora do Brasil é recusado; ponto dentro recebe o município e a UF certos.
- [ ] Voluntário não edita nem arquiva local de outra pessoa.
- [ ] Arquivar um local cancela os agendamentos futuros dele.
- [ ] Arquivamento em massa da conta arquiva só os locais dela.
- [ ] `DELETE` falha em todas as tabelas; `UPDATE` e `DELETE` em `historico` falham.
- [ ] Restaurar uma versão do histórico deixa o local exatamente como estava.
- [ ] Textos com telefone, CPF ou e-mail são recusados no front e no banco.
- [ ] Com o modo somente leitura ligado, só o administrador escreve.

**Agenda**

- [ ] Qualquer conta ativa vê a agenda de qualquer local, só com dia, horário e nome de exibição.
- [ ] Ninguém agenda outra pessoa; só o dono ou o administrador cancela.
- [ ] Agendamento sobreposto do mesmo usuário no mesmo local e dia é recusado.
- [ ] Agendamento fora da janela de hoje a 60 dias é recusado.

**Importação**

- [ ] Rodar `importar-osm.ts` duas vezes no mesmo município não cria duplicatas.
- [ ] Um local ativado ou arquivado não volta a `importado` numa nova importação.
- [ ] `--dry-run` não grava nada.
- [ ] `carregar-municipios.ts` é idempotente.

**Interface**

- [ ] Fluxo completo no celular: inscrição, espera, liberação pelo administrador, login, marcar local, agendar, ver agenda, cancelar.
- [ ] Fluxo do administrador: liberar e recusar em lote, aprovar pedido de limite, arquivar locais de uma conta, restaurar, modo somente leitura.
- [ ] Mapa com 50 mil locais continua fluido.
- [ ] Nome de local com `<script>` aparece como texto.
- [ ] Créditos do mapa visíveis.
- [ ] A chave de serviço não aparece no bundle publicado.

## Execução, testes e critério de parada

O agente implementa tudo o que este documento descreve numa única execução, sem versão reduzida nem entrega parcial. Ele só pode parar em duas situações: tudo pronto e aprovado nos testes, ou um bloqueio que depende de uma chave ou credencial que só o dono do projeto pode fornecer.

**Instruções para o agente de código**

1. Implemente o escopo completo deste documento. Não deixe funcionalidades para depois e não adicione nada fora do escopo.
2. Construa nesta ordem, sem parar entre as etapas:
   - Banco: migrations, tipos, tabelas, índices, linha padrão de `config`, trigger de criação de perfil, triggers de município, `atualizado_em` e histórico, trigger que impede alterar o histórico.
   - Regras de acesso: funções auxiliares, revogações, políticas de leitura, todas as funções RPC, `agenda_do_local`, `admin_listar_contas` e `locais_na_area`.
   - Scripts: `carregar-municipios.ts`, `criar-admin.ts`, `importar-osm.ts`, `importar-csv.ts`, `exportar.ts`.
   - Front-end em React com shadcn/ui: todas as telas da seção Telas e fluxos.
   - Edge Function `admin-usuarios`, configuração de deploy e cabeçalhos de segurança.
3. Desenvolva e teste tudo no ambiente local da Supabase CLI (`supabase start`), que não exige nenhuma chave do dono do projeto.
4. Escreva os testes junto com cada funcionalidade, não no fim.
5. Nos testes, use uma amostra da malha do IBGE e respostas gravadas do Overpass em fixtures; a carga nacional real roda só em produção.

**Testes obrigatórios**

| Camada | Ferramenta | O que precisa cobrir |
| --- | --- | --- |
| Banco e acesso | pgTAP com `supabase test db` | Todos os critérios de Contas, Locais e limite e Agenda, com contas de cada papel e status, inclusive chamadas diretas à API REST |
| Lógica do front-end | Vitest | Validações de campos, bloqueio de telefone, CPF e e-mail, mapeamento de tags, cálculo do dia em Brasília, formatação de datas |
| Scripts | Vitest com fixtures | Mapeamento de tipos, idempotência, preservação de status, `--dry-run` |
| Ponta a ponta | Playwright em Chromium e WebKit, em tela de celular (390×844) e de computador | Todos os fluxos de voluntário e de administrador dos critérios de Interface, mais limite diário, pedido de limite, senha temporária, injeção de HTML e desempenho com 50 mil locais |
| Build | Script de verificação | Chave de serviço ausente do bundle publicado |

**Rodadas de teste**

- Rodar a suíte completa (pgTAP, Vitest e Playwright) ao fim de cada etapa e novamente no final.
- A entrega exige três execuções completas seguidas sem nenhuma falha, recriando o banco do zero (`supabase db reset`) antes de cada uma.
- Teste instável conta como falha: corrigir a causa. É proibido aumentar tempos de espera às cegas, pular testes ou marcá-los como `skip`.
- É proibido apagar ou enfraquecer um teste para fazê-lo passar.

**Critério de parada**

O agente só encerra quando:

1. todos os critérios de aceite passam, comprovados pelas três execuções seguidas; ou
2. o próximo passo depende de algo que só o dono do projeto pode fornecer.

O que só o dono do projeto pode fornecer:

- URL e chaves do projeto Supabase de produção (anon e service\_role) e o vínculo da CLI com esse projeto.
- Acesso ao Netlify ou Vercel e, se houver, o domínio.
- A senha do administrador, digitada por ele ao rodar `criar-admin.ts`.

Antes de parar por falta de credencial, o agente termina tudo que pode ser feito sem ela, deixa o `.env.example` documentado e marca no código exatamente onde cada valor entra.

**Relatório final do agente**

- O que foi implementado, por seção deste documento.
- Resultado das três execuções de teste, com a contagem por suíte.
- Pendências que dependem de credenciais, com os passos exatos para concluir cada uma, na ordem da seção de configuração.
- Como rodar o projeto localmente, como publicar e como importar uma nova região.

## Decisões registradas

Todas as decisões abaixo foram confirmadas pelo dono do projeto e já estão aplicadas no documento. Não há decisões em aberto.

**Decisões registradas**

| Tema | Decisão |
| --- | --- |
| Nome | Mapa de Campanha |
| Abrangência | Brasil inteiro; dados inseridos aos poucos |
| Quem marca locais | Qualquer conta liberada |
| Inscrição | Aberta, por e-mail; conta liberada manualmente por administrador |
| E-mails automáticos | Nenhum; administradores fazem contato por fora |
| Agenda | Qualquer conta liberada vê quem se agendou em cada local |
| Interação entre usuários | Nenhuma |
| Limite diário | 10 locais; sem limite depois de liberação por administrador |
| Administrador inicial | `joaogaletti@gmail.com`, único no começo |
| Detecção de duplicatas | Não existe |
| Front-end | TypeScript puro |
| Provedor de tiles | CARTO Voyager, sujeito à conferência dos termos |

**Detalhes confirmados**

| Ponto | Decisão |
| --- | --- |
| Locais marcados aparecem para todos na hora, sem aprovação | Sim |
| Quem edita e arquiva um local | O autor e os administradores |
| Formato do agendamento | Dia e faixa de horário, até 60 dias à frente |
| Nome de exibição precisa ser único | Sim |
| Captcha na inscrição | Não, para não depender de outra chave; só limite por IP |
| Hospedagem | Netlify, subdomínio gratuito |
| Prazo para apagar a base depois da eleição | 30 dias |
