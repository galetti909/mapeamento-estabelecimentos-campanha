-- ===========================================================================
-- Historico imutavel, restauracao de versao e arquivamento em massa.
-- ===========================================================================
begin;
select plan(33);

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
  pg_temp.nova_conta('admin@exemplo.org', 'Admin', 'ativo', 'admin') as admin,
  pg_temp.nova_conta('ana@exemplo.org', 'Ana')                       as ana,
  pg_temp.nova_conta('bruno@exemplo.org', 'Bruno')                   as bruno;
grant select on c to authenticated;

-- ------------------------------------------------- historico e so insercao
select throws_ok(
  $$ update public.historico set acao = 'mexido' where id = (select min(id) from public.historico) $$,
  'P0001', 'historico_imutavel',
  'UPDATE no historico falha mesmo para o dono do banco'
);
select throws_ok(
  $$ delete from public.historico where id = (select min(id) from public.historico) $$,
  'P0001', 'historico_imutavel',
  'DELETE no historico falha mesmo para o dono do banco'
);
select throws_ok(
  $$ truncate public.historico $$,
  'P0001', 'historico_imutavel',
  'TRUNCATE no historico falha mesmo para o dono do banco'
);

-- toda mudanca de status ou papel de conta fica no historico
select is(
  (select count(*)::int from public.historico
   where tabela = 'perfis' and registro_id = (select ana from c)::text and acao = 'insert'),
  1,
  'a criacao do perfil fica no historico'
);

set role authenticated;
select pg_temp.entrar((select admin from c));

select lives_ok(
  $$ select public.admin_definir_status((select bruno from c), 'bloqueado') $$,
  'administrador bloqueia uma conta'
);
select is(
  (select acao from public.historico
   where tabela = 'perfis' and registro_id = (select bruno from c)::text
   order by id desc limit 1),
  'admin_definir_status',
  'a mudanca de status registra o nome da funcao RPC no historico'
);
select is(
  (select feito_por from public.historico
   where tabela = 'perfis' and registro_id = (select bruno from c)::text
   order by id desc limit 1),
  (select admin from c),
  'o historico guarda quem fez a alteracao'
);
select is(
  (select depois ->> 'status' from public.historico
   where tabela = 'perfis' and registro_id = (select bruno from c)::text
   order by id desc limit 1),
  'bloqueado',
  'o historico guarda o estado depois da alteracao'
);
select is(
  (select antes ->> 'status' from public.historico
   where tabela = 'perfis' and registro_id = (select bruno from c)::text
   order by id desc limit 1),
  'ativo',
  'o historico guarda o estado antes da alteracao'
);

select lives_ok(
  $$ select public.admin_definir_papel((select ana from c), 'admin') $$,
  'administrador promove uma conta'
);
select is(
  (select acao from public.historico
   where tabela = 'perfis' and registro_id = (select ana from c)::text
   order by id desc limit 1),
  'admin_definir_papel',
  'a mudanca de papel fica no historico'
);

-- voluntario nao le o historico
reset role;
update public.perfis set papel = 'voluntario' where id = (select ana from c);
set role authenticated;
select pg_temp.entrar((select ana from c));
select is((select count(*)::int from public.historico), 0,
  'voluntario nao le o historico');
select throws_ok(
  $$ select public.admin_historico() $$,
  'P0001', 'somente_admin',
  'voluntario nao chama admin_historico'
);

-- ------------------------------------------------------------- restauracao
select lives_ok(
  $$ select public.marcar_local('Feira Original', 'feira', -23.5505, -46.6333,
       'Praca Central', 'Sabados', 'Bem movimentada') $$,
  'a voluntaria marca um local'
);

-- As duas tabelas de apoio sao criadas como dono do banco: o historico so e
-- legivel por administrador, e aqui a sessao e da voluntaria.
reset role;
create temp table l as select id from public.locais where nome = 'Feira Original';
create temp table v as
  select max(id) as historico_id from public.historico
  where tabela = 'locais' and registro_id = (select id from l)::text;
grant select on l, v to authenticated;
set role authenticated;
select pg_temp.entrar((select ana from c));

select isnt((select historico_id from v), null,
  'a versao original do local esta no historico');

select lives_ok(
  $$ select public.editar_local((select id from l), 'Feira Trocada', 'mercado',
       'Outro endereco', 'Domingos', 'Mudou tudo') $$,
  'a voluntaria edita o local'
);
select lives_ok(
  $$ select public.arquivar_local((select id from l), 'teste de restauracao') $$,
  'a voluntaria arquiva o local'
);

select throws_ok(
  $$ select public.restaurar_local((select id from l), (select historico_id from v)) $$,
  'P0001', 'somente_admin',
  'voluntario nao restaura versao do historico'
);

select pg_temp.entrar((select admin from c));
select lives_ok(
  $$ select public.restaurar_local((select id from l), (select historico_id from v)) $$,
  'administrador restaura a versao gravada no historico'
);

select is((select nome from public.locais where id = (select id from l)),
  'Feira Original', 'a restauracao devolve o nome original');
select is((select tipo::text from public.locais where id = (select id from l)),
  'feira', 'a restauracao devolve o tipo original');
select is((select endereco from public.locais where id = (select id from l)),
  'Praca Central', 'a restauracao devolve o endereco original');
select is((select melhor_horario from public.locais where id = (select id from l)),
  'Sabados', 'a restauracao devolve o melhor horario original');
select is((select observacoes from public.locais where id = (select id from l)),
  'Bem movimentada', 'a restauracao devolve as observacoes originais');
select is((select status::text from public.locais where id = (select id from l)),
  'ativo', 'a restauracao devolve o status original');
select is((select motivo_arquivamento from public.locais where id = (select id from l)),
  null, 'a restauracao limpa o motivo de arquivamento');
select is(
  (select extensions.st_astext(geom::extensions.geometry) from public.locais where id = (select id from l)),
  'POINT(-46.6333 -23.5505)',
  'a restauracao devolve a posicao original'
);
select is((select uf from public.locais where id = (select id from l)),
  'SP'::char(2), 'a restauracao mantem a UF coerente com a posicao');

-- ------------------------------------------- arquivamento em massa da conta
select pg_temp.entrar((select ana from c));
select lives_ok(
  $$ do $x$
     begin
       for i in 1..4 loop
         perform public.marcar_local('Ana ' || i, 'comercio', -23.55, -46.63);
       end loop;
     end $x$ $$,
  'a voluntaria marca mais quatro locais'
);

reset role;
create temp table outro as select pg_temp.nova_conta('carla@exemplo.org', 'Carla') as carla;
grant select on outro to authenticated;
set role authenticated;
select pg_temp.entrar((select carla from outro));
select lives_ok(
  $$ select public.marcar_local('Local da Carla', 'bar', -23.55, -46.63) $$,
  'outra voluntaria marca o proprio local'
);

select pg_temp.entrar((select admin from c));
select is(
  (select public.admin_arquivar_locais_da_conta((select ana from c), 'conta usada para sabotagem')),
  5,
  'o arquivamento em massa arquiva os cinco locais ativos da conta'
);
select is(
  (select status::text from public.locais where nome = 'Local da Carla'),
  'ativo',
  'o arquivamento em massa nao toca nos locais de outra conta'
);
select is(
  (select count(*)::int from public.locais
   where (ativado_por = (select ana from c) or criado_por = (select ana from c))
     and status = 'ativo'),
  0,
  'a conta arquivada em massa nao tem mais nenhum local ativo'
);

reset role;
select * from finish();
rollback;
