-- ===========================================================================
-- Mapa de Campanha - 03 - tabelas, indices e linha padrao de config
-- ===========================================================================

-- --------------------------------------------------------------------------
-- perfis: uma linha por usuario de auth.users, criada por trigger na inscricao.
-- O e-mail NAO e copiado para ca; fica somente em auth.users e e lido pelos
-- administradores atraves de public.admin_listar_contas().
-- --------------------------------------------------------------------------
create table public.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome_exibicao text not null,
  papel         public.papel        not null default 'voluntario',
  status        public.status_conta not null default 'aguardando',
  sem_limite    boolean             not null default false,
  trocar_senha  boolean             not null default false,
  decidido_por  uuid references public.perfis (id),
  decidido_em   timestamptz,
  criado_em     timestamptz not null default now(),
  constraint perfis_nome_tamanho
    check (char_length(nome_exibicao) between 2 and 40),
  constraint perfis_nome_sem_dado_pessoal
    check (not public.contem_dado_pessoal(nome_exibicao))
);

-- Nome de exibicao unico, sem diferenciar maiusculas.
create unique index perfis_nome_exibicao_unico
  on public.perfis (lower(nome_exibicao));
create index perfis_status_idx on public.perfis (status);
create index perfis_papel_idx  on public.perfis (papel);

-- --------------------------------------------------------------------------
-- municipios: malha municipal do IBGE, carregada uma vez.
-- --------------------------------------------------------------------------
create table public.municipios (
  id   integer primary key,                      -- codigo IBGE de 7 digitos
  nome text    not null,
  uf   char(2) not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  constraint municipios_id_7_digitos check (id between 1000000 and 9999999)
);

create index municipios_geom_idx on public.municipios using gist (geom);
create index municipios_uf_idx   on public.municipios (uf);
create index municipios_nome_idx on public.municipios (lower(nome));

-- --------------------------------------------------------------------------
-- locais
-- --------------------------------------------------------------------------
create table public.locais (
  id                   uuid primary key default extensions.gen_random_uuid(),
  nome                 text not null,
  tipo                 public.tipo_local not null,
  geom                 extensions.geography(Point, 4326) not null,
  municipio_id         integer references public.municipios (id),
  uf                   char(2),
  endereco             text,
  melhor_horario       text,
  observacoes          text,
  status               public.status_local not null default 'importado',
  origem               public.origem_local not null default 'manual',
  origem_id            text,
  osm_tags             jsonb,
  criado_por           uuid references public.perfis (id),
  ativado_por          uuid references public.perfis (id),
  ativado_em           timestamptz,
  arquivado_por        uuid references public.perfis (id),
  arquivado_em         timestamptz,
  motivo_arquivamento  text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),

  constraint locais_nome_tamanho      check (char_length(nome) between 2 and 80),
  constraint locais_endereco_tamanho  check (endereco is null or char_length(endereco) <= 160),
  constraint locais_horario_tamanho   check (melhor_horario is null or char_length(melhor_horario) <= 80),
  constraint locais_obs_tamanho       check (observacoes is null or char_length(observacoes) <= 500),

  constraint locais_nome_sem_dado_pessoal     check (not public.contem_dado_pessoal(nome)),
  constraint locais_endereco_sem_dado_pessoal check (not public.contem_dado_pessoal(endereco)),
  constraint locais_horario_sem_dado_pessoal  check (not public.contem_dado_pessoal(melhor_horario)),
  constraint locais_obs_sem_dado_pessoal      check (not public.contem_dado_pessoal(observacoes)),

  -- Arquivar exige motivo e registra quem e quando.
  constraint locais_arquivamento_completo check (
    (status <> 'arquivado' and arquivado_em is null and motivo_arquivamento is null)
    or
    (status = 'arquivado' and arquivado_em is not null
       and motivo_arquivamento is not null
       and char_length(btrim(motivo_arquivamento)) between 3 and 300)
  ),
  -- Local ativo tem sempre quem o ativou e quando. Um importado pode ser
  -- arquivado direto por um administrador, sem nunca ter sido ativado.
  constraint locais_ativacao_completa check (
    status <> 'ativo' or (ativado_por is not null and ativado_em is not null)
  )
);

-- Chave natural da importacao: (origem, origem_id) quando origem_id existe.
create unique index locais_origem_unica
  on public.locais (origem, origem_id)
  where origem_id is not null;

create index locais_geom_idx      on public.locais using gist (geom);
create index locais_status_idx    on public.locais (status);
create index locais_uf_idx        on public.locais (uf);
create index locais_municipio_idx on public.locais (municipio_id);
create index locais_ativador_idx  on public.locais (ativado_por, ativado_em);
create index locais_tipo_idx      on public.locais (tipo);
create index locais_nome_idx      on public.locais (lower(nome));

-- --------------------------------------------------------------------------
-- agendamentos: cancelados, nunca excluidos. Sem campo de texto livre.
-- --------------------------------------------------------------------------
create table public.agendamentos (
  id            uuid primary key default extensions.gen_random_uuid(),
  local_id      uuid not null references public.locais (id),
  perfil_id     uuid not null references public.perfis (id),
  dia           date not null,
  hora_inicio   time not null,
  hora_fim      time not null,
  cancelado_em  timestamptz,
  cancelado_por uuid references public.perfis (id),
  criado_em     timestamptz not null default now(),

  constraint agendamentos_horario_valido check (hora_fim > hora_inicio),
  constraint agendamentos_cancelamento_completo
    check ((cancelado_em is null) = (cancelado_por is null)),

  -- Nenhum usuario tem dois agendamentos ativos sobrepostos no mesmo
  -- local e dia. A faixa usa tsrange sobre uma data fixa, so para comparar
  -- horarios; limites '[)', de modo que 08:00-10:00 e 10:00-12:00 nao se
  -- sobrepoem. tsrange vem do pg_catalog: nada novo no schema public, cujos
  -- privilegios de execucao sao todos revogados na migration 09.
  constraint agendamentos_sem_sobreposicao exclude using gist (
    local_id  with =,
    perfil_id with =,
    dia       with =,
    tsrange('2000-01-01'::date + hora_inicio, '2000-01-01'::date + hora_fim) with &&
  ) where (cancelado_em is null)
);

create index agendamentos_local_dia_idx on public.agendamentos (local_id, dia)
  where cancelado_em is null;
create index agendamentos_perfil_idx on public.agendamentos (perfil_id, dia)
  where cancelado_em is null;

-- --------------------------------------------------------------------------
-- pedidos_limite: no maximo um pedido aberto por perfil.
-- --------------------------------------------------------------------------
create table public.pedidos_limite (
  id           uuid primary key default extensions.gen_random_uuid(),
  perfil_id    uuid not null references public.perfis (id),
  status       public.status_pedido not null default 'aberto',
  criado_em    timestamptz not null default now(),
  decidido_por uuid references public.perfis (id),
  decidido_em  timestamptz
);

create unique index pedidos_limite_um_aberto
  on public.pedidos_limite (perfil_id)
  where status = 'aberto';
create index pedidos_limite_status_idx on public.pedidos_limite (status, criado_em);

-- --------------------------------------------------------------------------
-- historico: so recebe insercoes (ver triggers na migration 04).
-- --------------------------------------------------------------------------
create table public.historico (
  id          bigserial primary key,
  tabela      text not null,
  registro_id text not null,
  acao        text not null,
  feito_por   uuid references public.perfis (id),   -- nulo para scripts
  feito_em    timestamptz not null default now(),
  antes       jsonb,
  depois      jsonb
);

create index historico_tabela_registro_idx on public.historico (tabela, registro_id, id desc);
create index historico_feito_por_idx       on public.historico (feito_por, feito_em desc);
create index historico_feito_em_idx        on public.historico (feito_em desc);
create index historico_acao_idx            on public.historico (acao);

-- --------------------------------------------------------------------------
-- config: uma linha so.
-- --------------------------------------------------------------------------
create table public.config (
  id             boolean primary key default true,
  somente_leitura boolean not null default false,
  limite_diario   integer not null default 10,
  constraint config_linha_unica check (id),
  constraint config_limite_positivo check (limite_diario > 0)
);

insert into public.config (id, somente_leitura, limite_diario)
values (true, false, 10);
