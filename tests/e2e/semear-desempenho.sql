-- ===========================================================================
-- Carga de desempenho: 50 mil locais ativos espalhados pelo municipio de
-- MANAUS, usada pelo teste "mapa com 50 mil locais continua fluido".
--
-- Manaus de proposito: os testes de interface clicam no mapa dentro de Sao
-- Paulo, e um marcador sob o ponto de clique nao repassa o evento ao mapa. Com
-- a carga longe dali, as duas coisas convivem no mesmo banco.
--
-- Roda com a chave de servico (fora do app). Idempotente: a chave natural
-- (origem, origem_id) impede duplicatas.
-- ===========================================================================
do $$
declare
  v_id    uuid;
  v_alvo  integer := 50000;
begin
  select id into v_id from public.perfis where nome_exibicao = 'Carga de Desempenho';

  if v_id is null then
    v_id := extensions.gen_random_uuid();
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_id, 'carga-desempenho@teste.exemplo',
            '{"nome_exibicao":"Carga de Desempenho"}'::jsonb);
    update public.perfis set status = 'ativo' where id = v_id;
  end if;

  insert into public.locais (nome, tipo, geom, status, origem, origem_id, ativado_por, ativado_em)
  select 'Carga ' || i,
         'comercio',
         extensions.st_setsrid(
           extensions.st_makepoint(
             -60.29 + (i % 300) * 0.0023,            -- -60,29 .. -59,60
             -3.29 + ((i / 300) % 300) * 0.0024      --  -3,29 ..  -2,57
           ), 4326)::extensions.geography,
         'ativo', 'osm', 'carga/' || i, v_id, now()
  from generate_series(1, v_alvo) as i
  on conflict (origem, origem_id) where origem_id is not null do nothing;

  analyze public.locais;
end $$;
