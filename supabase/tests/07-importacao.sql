-- ===========================================================================
-- Importacao (criterios de aceite "Importacao"), na camada do banco.
-- A parte de rede dos scripts e testada no Vitest com fixtures gravadas.
-- ===========================================================================
begin;
select plan(23);

create or replace function pg_temp.nova_conta(
  p_email text, p_nome text,
  p_status public.status_conta default 'ativo',
  p_papel public.papel default 'voluntario'
) returns uuid language plpgsql as $$
declare v_id uuid := extensions.gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, p_email, jsonb_build_object('nome_exibicao', p_nome));
  if p_status <> 'aguardando' or p_papel <> 'voluntario' then
    update public.perfis set status = p_status, papel = p_papel where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function pg_temp.entrar(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end $$;

create temp table c as select
  pg_temp.nova_conta('ana@exemplo.org', 'Ana')                       as ana,
  pg_temp.nova_conta('admin@exemplo.org', 'Admin', 'ativo', 'admin') as admin;
grant select on c to authenticated;

create temp table lote as select $$[
  {"origem_id": "node/100", "nome": "Feira da Praca", "tipo": "feira",
   "lat": -23.5505, "lng": -46.6333, "osm_tags": {"amenity": "marketplace"}},
  {"origem_id": "node/101", "nome": "Padaria Central", "tipo": "padaria",
   "lat": -23.5510, "lng": -46.6340, "osm_tags": {"shop": "bakery"}},
  {"origem_id": "node/102", "nome": "Bar de Buenos Aires", "tipo": "bar",
   "lat": -34.6037, "lng": -58.3816, "osm_tags": {"amenity": "bar"}}
]$$::jsonb as dados;

-- ----------------------------------------------------- primeira importacao
select is(
  (select novos from public.importar_locais('osm', 'importar_osm', '3550308', (select dados from lote))),
  2,
  'a primeira importacao insere os dois locais validos'
);
select is(
  (select ignorados from public.importar_locais('osm', 'importar_osm', '3550308',
     $$[{"origem_id": "node/102", "nome": "Bar de Buenos Aires", "tipo": "bar",
         "lat": -34.6037, "lng": -58.3816}]$$::jsonb)),
  1,
  'o ponto fora do Brasil e ignorado sem derrubar o lote'
);
select is(
  (select count(*)::int from public.locais where origem = 'osm'),
  2,
  'so os locais dentro do Brasil entraram'
);
select is(
  (select status::text from public.locais where origem_id = 'node/100'),
  'importado',
  'o que vem da importacao entra como importado'
);
select is(
  (select uf from public.locais where origem_id = 'node/100'),
  'SP'::char(2),
  'o local importado recebe a UF pela posicao'
);
select is(
  (select osm_tags from public.locais where origem_id = 'node/100'),
  '{"amenity": "marketplace"}'::jsonb,
  'as tags do OSM sao guardadas'
);
select is(
  (select criado_por from public.locais where origem_id = 'node/100'),
  null,
  'local importado nao tem autor'
);

-- a importacao fica no historico
select is(
  (select count(*)::int from public.historico
   where tabela = 'importacao' and registro_id = '3550308' and acao = 'importar_osm'),
  2,
  'cada rodada de importacao registra um resumo no historico'
);
select is(
  (select (depois ->> 'novos')::int from public.historico
   where tabela = 'importacao' and registro_id = '3550308' order by id limit 1),
  2,
  'o resumo no historico guarda quantos locais sao novos'
);

-- -------------------------------------- rodar duas vezes nao cria duplicata
select is(
  (select novos from public.importar_locais('osm', 'importar_osm', '3550308', (select dados from lote))),
  0,
  'rodar a importacao de novo nao insere nada'
);
select is(
  (select count(*)::int from public.locais where origem = 'osm'),
  2,
  'rodar a importacao duas vezes no mesmo municipio nao cria duplicatas'
);

-- ------------------------------- local importado ainda importado e atualizado
select is(
  (select atualizados from public.importar_locais('osm', 'importar_osm', '3550308',
     $$[{"origem_id": "node/100", "nome": "Feira da Praca Nova", "tipo": "feira",
         "lat": -23.5600, "lng": -46.6400, "osm_tags": {"amenity": "marketplace", "name": "x"}}]$$::jsonb)),
  1,
  'local ainda importado e atualizado pela nova importacao'
);
select is(
  (select nome from public.locais where origem_id = 'node/100'),
  'Feira da Praca Nova',
  'o nome do local importado e atualizado'
);
select is(
  (select extensions.st_astext(geom::extensions.geometry) from public.locais where origem_id = 'node/100'),
  'POINT(-46.64 -23.56)',
  'a posicao do local importado e atualizada'
);

-- -------------------- local ativado ou arquivado nao volta a ser importado
set role authenticated;
select pg_temp.entrar((select ana from c));
select lives_ok(
  $$ select public.ativar_importado((select id from public.locais where origem_id = 'node/100')) $$,
  'a voluntaria ativa o local importado'
);
reset role;

select is(
  (select preservados from public.importar_locais('osm', 'importar_osm', '3550308',
     $$[{"origem_id": "node/100", "nome": "Nome Que Nao Deve Entrar", "tipo": "mercado",
         "lat": -23.1, "lng": -46.1, "osm_tags": {"amenity": "marketplace", "name": "atualizado"}}]$$::jsonb)),
  1,
  'local ja ativado entra na contagem de status preservado'
);
select is(
  (select status::text from public.locais where origem_id = 'node/100'),
  'ativo',
  'um local ativado nao volta a importado numa nova importacao'
);
select is(
  (select nome from public.locais where origem_id = 'node/100'),
  'Feira da Praca Nova',
  'o nome de um local ja ativado nao e sobrescrito pela importacao'
);
select is(
  (select osm_tags ->> 'name' from public.locais where origem_id = 'node/100'),
  'atualizado',
  'de um local ja ativado, so as osm_tags sao atualizadas'
);

-- -------------------------------------------- carregar_municipios idempotente
select is(
  (select atualizados from public.carregar_municipios(
     $$[{"id": 3550308, "nome": "Sao Paulo", "uf": "SP",
         "geometria": {"type": "Polygon", "coordinates":
           [[[-46.826,-24.008],[-46.365,-24.008],[-46.365,-23.357],[-46.826,-23.357],[-46.826,-24.008]]]}}]$$::jsonb)),
  1,
  'carregar_municipios atualiza um municipio que ja existe, sem duplicar'
);
select is(
  (select count(*)::int from public.municipios where id = 3550308),
  1,
  'o municipio continua com uma unica linha'
);
select is(
  (select inseridos from public.carregar_municipios(
     $$[{"id": 1100015, "nome": "Alta Floresta D Oeste", "uf": "RO",
         "geometria": {"type": "Polygon", "coordinates":
           [[[-62.5,-12.5],[-61.5,-12.5],[-61.5,-11.5],[-62.5,-11.5],[-62.5,-12.5]]]}}]$$::jsonb)),
  1,
  'carregar_municipios insere um municipio novo'
);

-- --------------------------------- importacao por CSV usa a mesma chave
select is(
  (select novos from public.importar_locais('dados_abertos', 'importar_csv', 'feiras.csv',
     $$[{"origem_id": "FEIRA-01", "nome": "Feira Livre da Rua X", "tipo": "feira",
         "lat": -23.55, "lng": -46.63, "endereco": "Rua X, 100"}]$$::jsonb)),
  1,
  'a importacao de CSV insere com origem dados_abertos'
);

select * from finish();
rollback;
