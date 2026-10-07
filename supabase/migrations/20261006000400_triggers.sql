-- ===========================================================================
-- Mapa de Campanha - 04 - triggers
--   * criacao do perfil na inscricao
--   * municipio/UF a partir da posicao
--   * atualizado_em
--   * historico (insercao automatica + imutabilidade)
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Usuario atual: auth.uid() devolve nulo quando nao ha JWT (scripts com a
-- chave de servico). Encapsulado para nao repetir o tratamento.
-- --------------------------------------------------------------------------
create or replace function public.usuario_atual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid();
$$;

-- --------------------------------------------------------------------------
-- Perfil criado na inscricao. O nome de exibicao vem dos metadados enviados
-- pelo formulario de inscricao. Nome repetido ou invalido faz a inscricao
-- falhar, que e o comportamento desejado (nome de exibicao e unico).
-- --------------------------------------------------------------------------
create or replace function public.criar_perfil_na_inscricao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  v_nome := btrim(coalesce(new.raw_user_meta_data ->> 'nome_exibicao', ''));

  if v_nome = '' then
    raise exception 'nome_exibicao_obrigatorio'
      using hint = 'Informe um nome de exibicao de 2 a 40 caracteres.';
  end if;

  if char_length(v_nome) < 2 or char_length(v_nome) > 40 then
    raise exception 'nome_exibicao_tamanho'
      using hint = 'O nome de exibicao precisa ter de 2 a 40 caracteres.';
  end if;

  if exists (select 1 from public.perfis p where lower(p.nome_exibicao) = lower(v_nome)) then
    raise exception 'nome_exibicao_em_uso'
      using hint = 'Esse nome de exibicao ja esta em uso.';
  end if;

  insert into public.perfis (id, nome_exibicao)
  values (new.id, v_nome);

  return new;
end;
$$;

create trigger criar_perfil_na_inscricao
  after insert on auth.users
  for each row execute function public.criar_perfil_na_inscricao();

-- --------------------------------------------------------------------------
-- Municipio e UF deduzidos da posicao. Ponto fora da malha municipal
-- brasileira e recusado.
-- --------------------------------------------------------------------------
create or replace function public.preencher_municipio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ponto extensions.geometry(Point, 4326);
  v_id    integer;
  v_uf    char(2);
begin
  v_ponto := new.geom::extensions.geometry;

  select m.id, m.uf into v_id, v_uf
  from public.municipios m
  where m.geom operator(extensions.&&) v_ponto
    and extensions.st_contains(m.geom, v_ponto)
  limit 1;

  if v_id is null then
    -- Tolerancia pequena para pontos na linha de costa e nas divisas, onde a
    -- malha simplificada pode deixar o ponto alguns metros de fora.
    select m.id, m.uf into v_id, v_uf
    from public.municipios m
    where extensions.st_dwithin(m.geom::extensions.geography, new.geom, 150)
    order by extensions.st_distance(m.geom::extensions.geography, new.geom)
    limit 1;
  end if;

  if v_id is null then
    raise exception 'ponto_fora_do_brasil'
      using hint = 'Marque um ponto dentro do territorio brasileiro.';
  end if;

  new.municipio_id := v_id;
  new.uf := v_uf;
  return new;
end;
$$;

create trigger locais_preencher_municipio
  before insert on public.locais
  for each row execute function public.preencher_municipio();

create trigger locais_preencher_municipio_update
  before update of geom on public.locais
  for each row
  when (new.geom is distinct from old.geom)
  execute function public.preencher_municipio();

-- --------------------------------------------------------------------------
-- atualizado_em
-- --------------------------------------------------------------------------
create or replace function public.marcar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger locais_atualizado_em
  before update on public.locais
  for each row execute function public.marcar_atualizado_em();

-- --------------------------------------------------------------------------
-- Historico. A acao e o nome da funcao RPC quando ela define
-- app.acao com set_config(..., true); senao, 'insert' ou 'update'.
-- --------------------------------------------------------------------------
create or replace function public.registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acao        text;
  v_registro_id text;
  v_feito_por   uuid;
begin
  v_acao := coalesce(nullif(current_setting('app.acao', true), ''), lower(tg_op));

  if tg_table_name = 'config' then
    v_registro_id := 'config';
  elsif tg_op = 'DELETE' then
    v_registro_id := (to_jsonb(old) ->> 'id');
  else
    v_registro_id := (to_jsonb(new) ->> 'id');
  end if;

  -- Somente perfis ja existentes podem assinar uma linha do historico; o
  -- trigger de inscricao roda antes de o perfil existir.
  select p.id into v_feito_por
  from public.perfis p
  where p.id = public.usuario_atual();

  insert into public.historico (tabela, registro_id, acao, feito_por, antes, depois)
  values (
    tg_table_name,
    v_registro_id,
    v_acao,
    v_feito_por,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return null;
end;
$$;

create trigger perfis_historico
  after insert or update on public.perfis
  for each row execute function public.registrar_historico();

create trigger locais_historico
  after insert or update on public.locais
  for each row execute function public.registrar_historico();

create trigger agendamentos_historico
  after insert or update on public.agendamentos
  for each row execute function public.registrar_historico();

create trigger pedidos_limite_historico
  after insert or update on public.pedidos_limite
  for each row execute function public.registrar_historico();

create trigger config_historico
  after update on public.config
  for each row execute function public.registrar_historico();

-- --------------------------------------------------------------------------
-- Historico imutavel: nem a chave de servico altera ou apaga uma linha.
-- --------------------------------------------------------------------------
create or replace function public.historico_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'historico_imutavel'
    using hint = 'O historico so aceita insercoes.';
end;
$$;

create trigger historico_sem_update
  before update on public.historico
  for each row execute function public.historico_imutavel();

create trigger historico_sem_delete
  before delete on public.historico
  for each row execute function public.historico_imutavel();

create trigger historico_sem_truncate
  before truncate on public.historico
  for each statement execute function public.historico_imutavel();
