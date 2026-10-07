-- ===========================================================================
-- Mapa de Campanha - 08b - funcoes usadas pelos scripts do administrador
--
-- Rodam somente com a chave de servico (service_role). A migration seguinte
-- revoga a execucao de tudo no schema public para anon e authenticated, de
-- modo que nenhum navegador alcanca estas funcoes.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- carregar_municipios: recebe a malha do IBGE em GeoJSON e grava os
-- municipios, simplificando as geometrias para manter as consultas leves.
-- Rodar de novo atualiza sem duplicar (upsert pelo codigo IBGE).
-- --------------------------------------------------------------------------
create or replace function public.carregar_municipios(
  p_dados      jsonb,
  p_tolerancia double precision default 0.001
)
returns table (inseridos integer, atualizados integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item        jsonb;
  v_inseridos   integer := 0;
  v_atualizados integer := 0;
  v_existe      boolean;
  v_geom        extensions.geometry;
begin
  for v_item in select * from jsonb_array_elements(p_dados) loop
    v_geom := extensions.st_multi(
      extensions.st_simplifypreservetopology(
        extensions.st_makevalid(
          extensions.st_setsrid(extensions.st_geomfromgeojson(v_item -> 'geometria'), 4326)
        ),
        p_tolerancia
      )
    )::extensions.geometry(MultiPolygon, 4326);

    select exists (select 1 from public.municipios m where m.id = (v_item ->> 'id')::integer)
      into v_existe;

    insert into public.municipios (id, nome, uf, geom)
    values ((v_item ->> 'id')::integer, v_item ->> 'nome', upper(v_item ->> 'uf'), v_geom)
    on conflict (id) do update
      set nome = excluded.nome, uf = excluded.uf, geom = excluded.geom;

    if v_existe then
      v_atualizados := v_atualizados + 1;
    else
      v_inseridos := v_inseridos + 1;
    end if;
  end loop;

  return query select v_inseridos, v_atualizados;
end;
$$;

-- --------------------------------------------------------------------------
-- importar_locais: upsert da importacao pela chave (origem, origem_id).
--   * nao existe             -> insere como 'importado'
--   * existe e e 'importado' -> atualiza nome, posicao, endereco e osm_tags
--   * ja ativado ou arquivado-> atualiza somente osm_tags, nunca o status
-- Cada item e isolado: um ponto fora do Brasil nao derruba o lote.
-- --------------------------------------------------------------------------
create or replace function public.importar_locais(
  p_origem      public.origem_local,
  p_acao        text,
  p_registro_id text,
  p_dados       jsonb
)
returns table (novos integer, atualizados integer, preservados integer, ignorados integer, erros jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item        jsonb;
  v_novos       integer := 0;
  v_atualizados integer := 0;
  v_preservados integer := 0;
  v_ignorados   integer := 0;
  v_erros       jsonb := '[]'::jsonb;
  v_status      public.status_local;
  v_origem_id   text;
begin
  perform set_config('app.acao', p_acao, true);

  for v_item in select * from jsonb_array_elements(p_dados) loop
    v_origem_id := v_item ->> 'origem_id';

    begin
      select l.status into v_status
      from public.locais l
      where l.origem = p_origem and l.origem_id = v_origem_id;

      if v_status is null then
        insert into public.locais (
          nome, tipo, geom, endereco, status, origem, origem_id, osm_tags
        )
        values (
          v_item ->> 'nome',
          (v_item ->> 'tipo')::public.tipo_local,
          extensions.st_setsrid(
            extensions.st_makepoint((v_item ->> 'lng')::double precision,
                                    (v_item ->> 'lat')::double precision), 4326
          )::extensions.geography,
          nullif(btrim(coalesce(v_item ->> 'endereco', '')), ''),
          'importado', p_origem, v_origem_id,
          coalesce(v_item -> 'osm_tags', '{}'::jsonb)
        );
        v_novos := v_novos + 1;

      elsif v_status = 'importado' then
        update public.locais l
           set nome     = v_item ->> 'nome',
               tipo     = (v_item ->> 'tipo')::public.tipo_local,
               geom     = extensions.st_setsrid(
                            extensions.st_makepoint((v_item ->> 'lng')::double precision,
                                                    (v_item ->> 'lat')::double precision), 4326
                          )::extensions.geography,
               endereco = nullif(btrim(coalesce(v_item ->> 'endereco', '')), ''),
               osm_tags = coalesce(v_item -> 'osm_tags', '{}'::jsonb)
         where l.origem = p_origem and l.origem_id = v_origem_id;
        v_atualizados := v_atualizados + 1;

      else
        -- Ja ativado ou arquivado por alguem: so as tags sao atualizadas.
        update public.locais l
           set osm_tags = coalesce(v_item -> 'osm_tags', '{}'::jsonb)
         where l.origem = p_origem and l.origem_id = v_origem_id;
        v_preservados := v_preservados + 1;
      end if;

    exception
      when others then
        v_ignorados := v_ignorados + 1;
        v_erros := v_erros || jsonb_build_object(
          'origem_id', v_origem_id,
          'nome', v_item ->> 'nome',
          'erro', sqlerrm
        );
    end;
  end loop;

  insert into public.historico (tabela, registro_id, acao, feito_por, depois)
  values ('importacao', coalesce(p_registro_id, 'sem_registro'), p_acao, null,
          jsonb_build_object(
            'origem', p_origem,
            'novos', v_novos,
            'atualizados', v_atualizados,
            'preservados', v_preservados,
            'ignorados', v_ignorados,
            'erros', v_erros
          ));

  return query select v_novos, v_atualizados, v_preservados, v_ignorados, v_erros;
end;
$$;

-- --------------------------------------------------------------------------
-- criar_admin_inicial: usada por scripts/criar-admin.ts depois de o usuario
-- existir em auth.users. Idempotente: rodar de novo nao duplica nada, so
-- garante papel 'admin' e status 'ativo'.
-- --------------------------------------------------------------------------
create or replace function public.criar_admin_inicial(p_id uuid, p_nome_exibicao text default null)
returns public.perfis
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis;
  v_nome   text := nullif(btrim(coalesce(p_nome_exibicao, '')), '');
begin
  perform set_config('app.acao', 'criar_admin_inicial', true);

  if not exists (select 1 from auth.users u where u.id = p_id) then
    raise exception 'usuario_nao_encontrado';
  end if;

  -- O nome de exibicao e unico. Se o pedido ja pertence a outra conta, o
  -- nome atual e mantido: o papel de administrador importa mais que o nome,
  -- e o script precisa continuar idempotente.
  if v_nome is not null and exists (
    select 1 from public.perfis p
    where lower(p.nome_exibicao) = lower(v_nome) and p.id <> p_id
  ) then
    raise warning 'nome de exibicao "%" ja esta em uso por outra conta; mantido o nome atual', v_nome;
    v_nome := null;
  end if;

  if not exists (select 1 from public.perfis p where p.id = p_id) then
    insert into public.perfis (id, nome_exibicao, papel, status)
    values (p_id, coalesce(v_nome, 'Administrador ' || left(p_id::text, 8)), 'admin', 'ativo');
  else
    update public.perfis
       set papel  = 'admin',
           status = 'ativo',
           nome_exibicao = coalesce(v_nome, nome_exibicao)
     where id = p_id;
  end if;

  select * into v_perfil from public.perfis p where p.id = p_id;
  return v_perfil;
end;
$$;

-- --------------------------------------------------------------------------
-- exportar_agendamentos: usada por scripts/exportar.ts. Nao devolve senha
-- nenhuma; o e-mail sai apenas para o backup do administrador.
-- --------------------------------------------------------------------------
create or replace function public.exportar_agendamentos()
returns table (
  id            uuid,
  local_id      uuid,
  local_nome    text,
  perfil_id     uuid,
  nome_exibicao text,
  dia           date,
  hora_inicio   time,
  hora_fim      time,
  cancelado_em  timestamptz,
  criado_em     timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select a.id, a.local_id, l.nome, a.perfil_id, p.nome_exibicao,
         a.dia, a.hora_inicio, a.hora_fim, a.cancelado_em, a.criado_em
  from public.agendamentos a
  join public.locais l on l.id = a.local_id
  join public.perfis p on p.id = a.perfil_id
  order by a.criado_em;
$$;

-- --------------------------------------------------------------------------
-- exportar_contas: e-mail e perfil, sem senha nem hash.
-- --------------------------------------------------------------------------
create or replace function public.exportar_contas()
returns table (
  id            uuid,
  email         text,
  nome_exibicao text,
  papel         public.papel,
  status        public.status_conta,
  sem_limite    boolean,
  criado_em     timestamptz,
  decidido_em   timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.id, u.email::text, p.nome_exibicao, p.papel, p.status,
         p.sem_limite, p.criado_em, p.decidido_em
  from public.perfis p
  join auth.users u on u.id = p.id
  order by p.criado_em;
$$;

-- --------------------------------------------------------------------------
-- exportar_locais: inclui latitude e longitude em colunas proprias.
-- --------------------------------------------------------------------------
create or replace function public.exportar_locais()
returns table (
  id                  uuid,
  nome                text,
  tipo                public.tipo_local,
  lat                 double precision,
  lng                 double precision,
  municipio_id        integer,
  municipio_nome      text,
  uf                  char(2),
  endereco            text,
  melhor_horario      text,
  observacoes         text,
  status              public.status_local,
  origem              public.origem_local,
  origem_id           text,
  criado_por          uuid,
  ativado_por         uuid,
  ativado_em          timestamptz,
  arquivado_por       uuid,
  arquivado_em        timestamptz,
  motivo_arquivamento text,
  criado_em           timestamptz,
  atualizado_em       timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select l.id, l.nome, l.tipo,
         extensions.st_y(l.geom::extensions.geometry)::double precision,
         extensions.st_x(l.geom::extensions.geometry)::double precision,
         l.municipio_id, m.nome, l.uf, l.endereco, l.melhor_horario, l.observacoes,
         l.status, l.origem, l.origem_id, l.criado_por, l.ativado_por, l.ativado_em,
         l.arquivado_por, l.arquivado_em, l.motivo_arquivamento, l.criado_em, l.atualizado_em
  from public.locais l
  left join public.municipios m on m.id = l.municipio_id
  order by l.criado_em;
$$;
