-- ===========================================================================
-- Mapa de Campanha - 08 - funcoes de leitura
-- ===========================================================================

-- --------------------------------------------------------------------------
-- agenda_do_local: unica porta de saida da agenda. Devolve so dia, horario e
-- nome de exibicao dos agendamentos nao cancelados de hoje em diante.
-- Nenhuma outra informacao de outro usuario sai do banco.
-- --------------------------------------------------------------------------
create or replace function public.agenda_do_local(p_local_id uuid)
returns table (
  id            uuid,
  dia           date,
  hora_inicio   time,
  hora_fim      time,
  nome_exibicao text,
  meu           boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_conta_ativa();

  return query
    select a.id, a.dia, a.hora_inicio, a.hora_fim, p.nome_exibicao,
           (a.perfil_id = auth.uid()) as meu
    from public.agendamentos a
    join public.perfis p on p.id = a.perfil_id
    where a.local_id = p_local_id
      and a.cancelado_em is null
      and a.dia >= public.hoje_brasilia()
    order by a.dia, a.hora_inicio, p.nome_exibicao;
end;
$$;

-- --------------------------------------------------------------------------
-- locais_com_agenda_proxima: ids dos locais com agendamento nos proximos 7
-- dias. Existe para o filtro do mapa: devolve apenas ids de locais que a
-- conta ja enxerga, nada sobre quem se agendou.
-- --------------------------------------------------------------------------
create or replace function public.locais_com_agenda_proxima(p_dias integer default 7)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.local_id
  from public.agendamentos a
  where public.conta_ativa()
    and a.cancelado_em is null
    and a.dia between public.hoje_brasilia()
                  and public.hoje_brasilia() + greatest(coalesce(p_dias, 7), 0);
$$;

-- --------------------------------------------------------------------------
-- locais_na_area: carga do mapa por area visivel.
-- SECURITY INVOKER de proposito: respeita o RLS de locais, devolve so as
-- colunas do marcador e no maximo 3.000 pontos por chamada.
-- Com zoom muito afastado (< 9) devolve contagens por municipio.
-- --------------------------------------------------------------------------
create or replace function public.locais_na_area(
  p_oeste            double precision,
  p_sul              double precision,
  p_leste            double precision,
  p_norte            double precision,
  p_zoom             integer default 12,
  p_status           public.status_local[] default array['ativo']::public.status_local[],
  p_tipos            public.tipo_local[]   default null,
  p_uf               char(2)               default null,
  p_municipio        integer               default null,
  p_busca            text                  default null,
  p_com_agendamento  boolean               default false,
  p_limite           integer               default 3000
)
returns table (
  modo           text,
  id             uuid,
  nome           text,
  tipo           public.tipo_local,
  status         public.status_local,
  lat            double precision,
  lng            double precision,
  municipio_id   integer,
  municipio_nome text,
  uf             char(2),
  quantidade     integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_caixa  extensions.geography;
  v_limite integer := least(greatest(coalesce(p_limite, 3000), 1), 3000);
begin
  v_caixa := extensions.st_makeenvelope(p_oeste, p_sul, p_leste, p_norte, 4326)::extensions.geography;

  if coalesce(p_zoom, 12) < 9 then
    -- Zoom afastado: contagem por municipio, com o ponto no centro dele.
    -- A contagem e feita antes do join: agrupar por m.geom obrigaria o banco
    -- a comparar multipoligonos inteiros.
    return query
      with contagens as (
        select l.municipio_id as mid, count(*)::integer as total
        from public.locais l
        where l.geom operator(extensions.&&) v_caixa
          and l.status = any (coalesce(p_status, array['ativo']::public.status_local[]))
          and (p_tipos is null or l.tipo = any (p_tipos))
          and (p_uf is null or l.uf = p_uf)
          and (p_municipio is null or l.municipio_id = p_municipio)
          and (p_busca is null or btrim(p_busca) = ''
               or l.nome ilike '%' || btrim(p_busca) || '%'
               or l.municipio_id in (
                 select m2.id from public.municipios m2
                 where m2.nome ilike '%' || btrim(p_busca) || '%'
               ))
          and (not coalesce(p_com_agendamento, false)
               or l.id in (select public.locais_com_agenda_proxima(7)))
        group by l.municipio_id
      )
      select 'contagem'::text,
             null::uuid,
             m.nome,
             null::public.tipo_local,
             null::public.status_local,
             extensions.st_y(extensions.st_centroid(m.geom))::double precision,
             extensions.st_x(extensions.st_centroid(m.geom))::double precision,
             m.id,
             m.nome,
             m.uf,
             c.total
      from contagens c
      join public.municipios m on m.id = c.mid
      order by c.total desc
      limit v_limite;
  else
    return query
      select 'ponto'::text,
             l.id,
             l.nome,
             l.tipo,
             l.status,
             extensions.st_y(l.geom::extensions.geometry)::double precision,
             extensions.st_x(l.geom::extensions.geometry)::double precision,
             l.municipio_id,
             m.nome,
             l.uf,
             null::integer
      from public.locais l
      left join public.municipios m on m.id = l.municipio_id
      -- "&&" compara caixas envolventes e usa o indice GIST de locais.geom.
      -- Para um ponto contra um retangulo alinhado aos eixos, o teste de
      -- caixa e exato: e justamente o que a area visivel do mapa pede.
      where l.geom operator(extensions.&&) v_caixa
        and l.status = any (coalesce(p_status, array['ativo']::public.status_local[]))
        and (p_tipos is null or l.tipo = any (p_tipos))
        and (p_uf is null or l.uf = p_uf)
        and (p_municipio is null or l.municipio_id = p_municipio)
        and (p_busca is null or btrim(p_busca) = ''
             or l.nome ilike '%' || btrim(p_busca) || '%'
             or m.nome ilike '%' || btrim(p_busca) || '%')
        and (not coalesce(p_com_agendamento, false)
             or l.id in (select public.locais_com_agenda_proxima(7)))
      limit v_limite;
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- local_detalhe: ficha completa, buscada so ao abrir um local. Respeita o
-- RLS de locais (SECURITY INVOKER) e acrescenta o que o front precisa para
-- decidir quais botoes mostrar.
-- --------------------------------------------------------------------------
create or replace function public.local_detalhe(p_id uuid)
returns table (
  id                  uuid,
  nome                text,
  tipo                public.tipo_local,
  status              public.status_local,
  origem              public.origem_local,
  lat                 double precision,
  lng                 double precision,
  endereco            text,
  melhor_horario      text,
  observacoes         text,
  municipio_nome      text,
  uf                  char(2),
  motivo_arquivamento text,
  criado_em           timestamptz,
  posso_alterar       boolean
)
language sql
stable
set search_path = ''
as $$
  select l.id, l.nome, l.tipo, l.status, l.origem,
         extensions.st_y(l.geom::extensions.geometry)::double precision,
         extensions.st_x(l.geom::extensions.geometry)::double precision,
         l.endereco, l.melhor_horario, l.observacoes,
         m.nome, l.uf, l.motivo_arquivamento, l.criado_em,
         public.pode_alterar_local(l.id)
  from public.locais l
  left join public.municipios m on m.id = l.municipio_id
  where l.id = p_id;
$$;

-- --------------------------------------------------------------------------
-- meus_agendamentos: tela "Meus agendamentos".
-- --------------------------------------------------------------------------
create or replace function public.meus_agendamentos()
returns table (
  id             uuid,
  local_id       uuid,
  local_nome     text,
  municipio_nome text,
  uf             char(2),
  dia            date,
  hora_inicio    time,
  hora_fim       time
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_conta_ativa();

  return query
    select a.id, l.id, l.nome, m.nome, l.uf, a.dia, a.hora_inicio, a.hora_fim
    from public.agendamentos a
    join public.locais l on l.id = a.local_id
    left join public.municipios m on m.id = l.municipio_id
    where a.perfil_id = auth.uid()
      and a.cancelado_em is null
      and a.dia >= public.hoje_brasilia()
    order by a.dia, a.hora_inicio;
end;
$$;

-- --------------------------------------------------------------------------
-- admin_listar_contas: unica forma de um administrador ler o e-mail de outra
-- conta. O e-mail nunca fica numa tabela exposta.
-- --------------------------------------------------------------------------
create or replace function public.admin_listar_contas(
  p_status public.status_conta default null,
  p_busca  text default null,
  p_limite integer default 200,
  p_pagina integer default 0
)
returns table (
  id                 uuid,
  email              text,
  nome_exibicao      text,
  papel              public.papel,
  status             public.status_conta,
  sem_limite         boolean,
  trocar_senha       boolean,
  criado_em          timestamptz,
  decidido_em        timestamptz,
  decidido_por_nome  text,
  locais_ativos      integer,
  marcados_hoje      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 500);
begin
  perform public.exigir_admin();

  return query
    select p.id,
           u.email::text,
           p.nome_exibicao,
           p.papel,
           p.status,
           p.sem_limite,
           p.trocar_senha,
           p.criado_em,
           p.decidido_em,
           d.nome_exibicao,
           (select count(*)::integer from public.locais l
             where l.status = 'ativo'
               and (l.ativado_por = p.id or l.criado_por = p.id)),
           public.locais_marcados_hoje(p.id)
    from public.perfis p
    join auth.users u on u.id = p.id
    left join public.perfis d on d.id = p.decidido_por
    where (p_status is null or p.status = p_status)
      and (p_busca is null or btrim(p_busca) = ''
           or p.nome_exibicao ilike '%' || btrim(p_busca) || '%'
           or u.email::text ilike '%' || btrim(p_busca) || '%')
    order by p.criado_em desc
    limit v_limite
    offset greatest(coalesce(p_pagina, 0), 0) * v_limite;
end;
$$;

-- --------------------------------------------------------------------------
-- admin_contadores: numeros do menu do administrador.
-- --------------------------------------------------------------------------
create or replace function public.admin_contadores()
returns table (contas_aguardando integer, pedidos_abertos integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();

  return query
    select (select count(*)::integer from public.perfis p where p.status = 'aguardando'),
           (select count(*)::integer from public.pedidos_limite pl where pl.status = 'aberto');
end;
$$;

-- --------------------------------------------------------------------------
-- admin_listar_pedidos: pedidos de limite com o nome de quem pediu e quantos
-- locais a pessoa marcou.
-- --------------------------------------------------------------------------
create or replace function public.admin_listar_pedidos(
  p_status public.status_pedido default 'aberto'
)
returns table (
  id            uuid,
  perfil_id     uuid,
  nome_exibicao text,
  email         text,
  status        public.status_pedido,
  criado_em     timestamptz,
  locais_total  integer,
  marcados_hoje integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();

  return query
    select pl.id, pl.perfil_id, p.nome_exibicao, u.email::text, pl.status, pl.criado_em,
           (select count(*)::integer from public.locais l where l.ativado_por = p.id),
           public.locais_marcados_hoje(p.id)
    from public.pedidos_limite pl
    join public.perfis p on p.id = pl.perfil_id
    join auth.users u on u.id = p.id
    where (p_status is null or pl.status = p_status)
    order by pl.criado_em;
end;
$$;

-- --------------------------------------------------------------------------
-- admin_historico: lista filtravel para a tela de historico. Devolve tambem
-- o nome de quem fez a alteracao, que nao sai do join direto na tabela.
-- --------------------------------------------------------------------------
create or replace function public.admin_historico(
  p_tabela      text default null,
  p_registro_id text default null,
  p_acao        text default null,
  p_feito_por   uuid default null,
  p_de          timestamptz default null,
  p_ate         timestamptz default null,
  p_limite      integer default 100,
  p_pagina      integer default 0
)
returns table (
  id          bigint,
  tabela      text,
  registro_id text,
  acao        text,
  feito_por   uuid,
  autor_nome  text,
  feito_em    timestamptz,
  antes       jsonb,
  depois      jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
begin
  perform public.exigir_admin();

  return query
    select h.id, h.tabela, h.registro_id, h.acao, h.feito_por,
           coalesce(p.nome_exibicao, 'script do administrador'),
           h.feito_em, h.antes, h.depois
    from public.historico h
    left join public.perfis p on p.id = h.feito_por
    where (p_tabela is null or h.tabela = p_tabela)
      and (p_registro_id is null or h.registro_id = p_registro_id)
      and (p_acao is null or h.acao = p_acao)
      and (p_feito_por is null or h.feito_por = p_feito_por)
      and (p_de is null or h.feito_em >= p_de)
      and (p_ate is null or h.feito_em <= p_ate)
    order by h.id desc
    limit v_limite
    offset greatest(coalesce(p_pagina, 0), 0) * v_limite;
end;
$$;

-- --------------------------------------------------------------------------
-- municipios_da_uf: alimenta o filtro de municipio sem trafegar geometria.
-- --------------------------------------------------------------------------
create or replace function public.municipios_da_uf(p_uf char(2))
returns table (id integer, nome text, uf char(2))
language sql
stable
set search_path = ''
as $$
  select m.id, m.nome, m.uf
  from public.municipios m
  where p_uf is null or m.uf = p_uf
  order by m.nome;
$$;

-- --------------------------------------------------------------------------
-- municipio_no_ponto: usada pela busca por municipio e pelo botao
-- "onde estou" para centralizar o mapa.
-- --------------------------------------------------------------------------
create or replace function public.buscar_municipios(p_busca text, p_limite integer default 20)
returns table (id integer, nome text, uf char(2), lat double precision, lng double precision)
language sql
stable
set search_path = ''
as $$
  select m.id, m.nome, m.uf,
         extensions.st_y(extensions.st_centroid(m.geom))::double precision,
         extensions.st_x(extensions.st_centroid(m.geom))::double precision
  from public.municipios m
  where btrim(coalesce(p_busca, '')) <> ''
    and m.nome ilike '%' || btrim(p_busca) || '%'
  order by m.nome
  limit least(greatest(coalesce(p_limite, 20), 1), 50);
$$;
