-- ===========================================================================
-- Locais visitados.
--
-- Um local conta como visitado quando teve pelo menos um agendamento nao
-- cancelado cujo horario ja terminou (no fuso America/Sao_Paulo). Nao ha
-- campo novo: o dado sai dos agendamentos que ja existem. O mapa usa isso
-- para pintar o ponto de verde.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- locais_visitados: ids dos locais com agendamento ja encerrado. SECURITY
-- DEFINER pelo mesmo motivo de locais_com_agenda_proxima: o RLS de
-- agendamentos so mostra os proprios, e o mapa precisa saber de todos. Sai
-- so o id do local, nada sobre quem se agendou.
-- --------------------------------------------------------------------------
create or replace function public.locais_visitados()
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
    and (a.dia < public.hoje_brasilia()
         or (a.dia = public.hoje_brasilia()
             and a.hora_fim <= (now() at time zone 'America/Sao_Paulo')::time));
$$;

-- --------------------------------------------------------------------------
-- local_foi_visitado: o mesmo teste para um local so, usado pela ficha.
-- --------------------------------------------------------------------------
create or replace function public.local_foi_visitado(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.locais_visitados() v where v = p_id);
$$;

-- --------------------------------------------------------------------------
-- locais_na_area ganha "visitado" (modo ponto) e "visitados" (modo
-- contagem). Mudar as colunas de retorno exige recriar a funcao.
-- --------------------------------------------------------------------------
drop function public.locais_na_area(double precision, double precision, double precision, double precision, integer, public.status_local[], public.tipo_local[], char, integer, text, boolean, integer);

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
  quantidade     integer,
  visitado       boolean,
  visitados      integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_caixa  extensions.geography;
  v_limite integer := least(greatest(coalesce(p_limite, 3000), 1), 3000);
  -- Lido uma vez so: a lista de visitados e pequena perto da de locais.
  v_visitados uuid[] := array(select public.locais_visitados());
begin
  v_caixa := extensions.st_makeenvelope(p_oeste, p_sul, p_leste, p_norte, 4326)::extensions.geography;

  if coalesce(p_zoom, 12) < 9 then
    -- Zoom afastado: contagem por municipio, com o ponto no centro dele.
    -- A contagem e feita antes do join: agrupar por m.geom obrigaria o banco
    -- a comparar multipoligonos inteiros.
    return query
      with contagens as (
        select l.municipio_id as mid, count(*)::integer as total,
               count(*) filter (where l.id = any (v_visitados))::integer as visitados
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
             c.total,
             null::boolean,
             c.visitados
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
             null::integer,
             l.id = any (v_visitados),
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

grant execute on function public.locais_na_area(double precision, double precision, double precision, double precision, integer, public.status_local[], public.tipo_local[], char, integer, text, boolean, integer) to authenticated;
grant execute on function public.locais_visitados()                                   to authenticated;
grant execute on function public.local_foi_visitado(uuid)                             to authenticated;
revoke all on function public.locais_na_area(double precision, double precision, double precision, double precision, integer, public.status_local[], public.tipo_local[], char, integer, text, boolean, integer) from anon, public;
revoke all on function public.locais_visitados() from anon, public;
revoke all on function public.local_foi_visitado(uuid) from anon, public;
