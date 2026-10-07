-- ===========================================================================
-- Locais e limite diario (criterios de aceite "Locais e limite").
-- ===========================================================================
begin;
select plan(54);

create or replace function pg_temp.nova_conta(
  p_email  text,
  p_nome   text,
  p_status public.status_conta default 'ativo',
  p_papel  public.papel default 'voluntario'
) returns uuid language plpgsql as $$
declare
  v_id uuid := extensions.gen_random_uuid();
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

-- As funcoes auxiliares internas (locais_marcados_hoje) nao tem grant para
-- authenticated, de proposito. Este atalho SECURITY DEFINER, criado pelo
-- postgres, permite conferi-las de dentro dos testes.
create or replace function pg_temp.marcados_hoje(p_perfil uuid)
returns integer language sql security definer as $$
  select public.locais_marcados_hoje(p_perfil);
$$;

create temp table c as select
  pg_temp.nova_conta('admin@exemplo.org', 'Admin', 'ativo', 'admin') as admin,
  pg_temp.nova_conta('ana@exemplo.org', 'Ana')                       as ana,
  pg_temp.nova_conta('bruno@exemplo.org', 'Bruno')                   as bruno;
grant select on c to authenticated;

-- local importado, para os testes de ativacao
insert into public.locais (nome, tipo, geom, status, origem, origem_id, osm_tags)
values ('Feira Importada', 'feira',
        extensions.st_setsrid(extensions.st_makepoint(-46.6333, -23.5505), 4326)::extensions.geography,
        'importado', 'osm', 'node/1', '{"amenity":"marketplace"}'::jsonb);

set role authenticated;

-- ------------------------------------------- municipio e UF pela posicao
select pg_temp.entrar((select ana from c));

select lives_ok(
  $$ select public.marcar_local('Praca da Se', 'praca', -23.5505, -46.6333,
       'Centro', 'Manhas de sabado', 'Muito movimento na feira') $$,
  'marcar_local aceita um ponto dentro do Brasil'
);

select is(
  (select uf from public.locais where nome = 'Praca da Se'),
  'SP'::char(2),
  'o trigger preenche a UF certa a partir da posicao'
);
select is(
  (select m.nome from public.locais l join public.municipios m on m.id = l.municipio_id
   where l.nome = 'Praca da Se'),
  'São Paulo',
  'o trigger preenche o municipio certo a partir da posicao'
);
select is(
  (select status::text from public.locais where nome = 'Praca da Se'),
  'ativo',
  'local marcado por voluntario nasce ativo (aparece para todos na hora)'
);
select is(
  (select origem::text from public.locais where nome = 'Praca da Se'),
  'manual',
  'local marcado por voluntario tem origem manual'
);

-- ponto fora do Brasil (Buenos Aires)
select throws_ok(
  $$ select public.marcar_local('Bar Portenho', 'bar', -34.6037, -58.3816) $$,
  'P0001', 'ponto_fora_do_brasil',
  'ponto fora do Brasil e recusado'
);

-- ------------------------------------------- dados pessoais nos textos
select throws_ok(
  $$ select public.marcar_local('Feira (11) 91234-5678', 'feira', -23.55, -46.63) $$,
  '23514', null,
  'nome com telefone e recusado pelo banco'
);
select throws_ok(
  $$ select public.marcar_local('Feira Boa', 'feira', -23.55, -46.63,
       null, null, 'falar com joao@exemplo.org') $$,
  '23514', null,
  'observacoes com e-mail sao recusadas pelo banco'
);
select throws_ok(
  $$ select public.marcar_local('Feira Boa', 'feira', -23.55, -46.63,
       'Rua X, cpf 123.456.789-01') $$,
  '23514', null,
  'endereco com CPF e recusado pelo banco'
);
select lives_ok(
  $$ select public.marcar_local('Feira do Largo 2000', 'feira', -23.55, -46.63,
       'Rua 25 de Marco, 1000') $$,
  'numero de endereco comum nao e confundido com telefone'
);

-- ------------------------------------------------------ ativar importado
select lives_ok(
  $$ select public.ativar_importado((select id from public.locais where origem_id = 'node/1')) $$,
  'conta ativa ativa um local importado'
);
select is(
  (select status::text from public.locais where origem_id = 'node/1'),
  'ativo',
  'o local importado passa a ativo'
);
select is(
  (select ativado_por from public.locais where origem_id = 'node/1'),
  (select ana from c),
  'o local importado registra quem o ativou'
);
select throws_ok(
  $$ select public.ativar_importado((select id from public.locais where origem_id = 'node/1')) $$,
  'P0001', 'local_nao_importado',
  'nao da para ativar duas vezes o mesmo local'
);

-- ------------------------------------------------------- limite diario
-- Ana ja usou 3 das 10 marcacoes do dia.
select is((select usados from public.meu_limite()), 3, 'meu_limite conta as marcacoes de hoje');
select is((select restantes from public.meu_limite()), 7, 'meu_limite mostra quantas restam');

do $$
begin
  for i in 4..10 loop
    perform public.marcar_local('Ponto ' || i, 'comercio', -23.55, -46.63);
  end loop;
end $$;

select is((select pg_temp.marcados_hoje((select ana from c))), 10,
  'o voluntario chegou a 10 locais no dia');
select is((select restantes from public.meu_limite()), 0, 'nao restam marcacoes');

select throws_ok(
  $$ select public.marcar_local('Ponto 11', 'comercio', -23.55, -46.63) $$,
  'P0001', 'limite_diario_atingido',
  'o 11o local marcado no mesmo dia e recusado'
);

-- ativar importado tambem conta no limite
reset role;
insert into public.locais (nome, tipo, geom, status, origem, origem_id)
values ('Outra Feira Importada', 'feira',
        extensions.st_setsrid(extensions.st_makepoint(-46.64, -23.56), 4326)::extensions.geography,
        'importado', 'osm', 'node/2');
set role authenticated;
select pg_temp.entrar((select ana from c));

select throws_ok(
  $$ select public.ativar_importado((select id from public.locais where origem_id = 'node/2')) $$,
  'P0001', 'limite_diario_atingido',
  'ativar um importado tambem para no limite diario'
);

-- o limite reinicia a meia-noite de Brasilia
reset role;
update public.locais
   set ativado_em = (public.hoje_brasilia() - 1 + time '23:30') at time zone 'America/Sao_Paulo'
 where ativado_por = (select ana from c);
set role authenticated;
select pg_temp.entrar((select ana from c));

select is((select pg_temp.marcados_hoje((select ana from c))), 0,
  'marcacoes de ontem (23:30 em Brasilia) nao contam hoje');
select lives_ok(
  $$ select public.marcar_local('Ponto de Hoje', 'comercio', -23.55, -46.63) $$,
  'o limite reinicia a meia-noite de Brasilia'
);

-- --------------------------------------------- pedido de liberacao de limite
reset role;
update public.locais
   set ativado_em = (public.hoje_brasilia() + time '09:00') at time zone 'America/Sao_Paulo'
 where ativado_por = (select ana from c);
set role authenticated;
select pg_temp.entrar((select ana from c));

select throws_ok(
  $$ select public.marcar_local('Mais Um', 'comercio', -23.55, -46.63) $$,
  'P0001', 'limite_diario_atingido',
  'de volta ao limite com 11 locais no dia'
);

select lives_ok($$ select public.pedir_liberacao_limite() $$, 'voluntario pede liberacao do limite');
select throws_ok(
  $$ select public.pedir_liberacao_limite() $$,
  'P0001', 'pedido_ja_aberto',
  'so um pedido aberto por vez'
);
select is((select pedido_aberto from public.meu_limite()), true, 'meu_limite indica o pedido aberto');

select pg_temp.entrar((select admin from c));
select is((select count(*)::int from public.admin_listar_pedidos('aberto')), 1,
  'o pedido aparece para o administrador');
select lives_ok(
  $$ select public.admin_decidir_pedido((select id from public.pedidos_limite limit 1), true) $$,
  'administrador aprova o pedido'
);

select pg_temp.entrar((select ana from c));
select is((select sem_limite from public.perfis where id = (select ana from c)), true,
  'pedido aprovado liga sem_limite');
select lives_ok(
  $$ select public.marcar_local('Sem Limite 1', 'comercio', -23.55, -46.63) $$,
  'pedido aprovado deixa o voluntario sem limite'
);

select pg_temp.entrar((select admin from c));
select lives_ok(
  $$ select public.admin_definir_limite((select ana from c), false) $$,
  'administrador retira a liberacao do limite'
);
select pg_temp.entrar((select ana from c));
select throws_ok(
  $$ select public.marcar_local('Sem Limite 2', 'comercio', -23.55, -46.63) $$,
  'P0001', 'limite_diario_atingido',
  'retirar a liberacao volta ao limite'
);

-- --------------------------------------------- administrador nao tem limite
select pg_temp.entrar((select admin from c));
select lives_ok(
  $$ do $x$
     begin
       for i in 1..12 loop
         perform public.marcar_local('Admin ' || i, 'comercio', -23.55, -46.63);
       end loop;
     end $x$ $$,
  'administrador marca mais de 10 locais no mesmo dia (sem limite)'
);

-- --------------------------------------------------- autoria de alteracoes
select pg_temp.entrar((select bruno from c));
select throws_ok(
  $$ select public.editar_local((select id from public.locais where nome = 'Praca da Se'),
       'Praca Editada', 'praca') $$,
  'P0001', 'sem_permissao',
  'voluntario nao edita local de outra pessoa'
);
select throws_ok(
  $$ select public.arquivar_local((select id from public.locais where nome = 'Praca da Se'),
       'nao gostei') $$,
  'P0001', 'sem_permissao',
  'voluntario nao arquiva local de outra pessoa'
);

select pg_temp.entrar((select ana from c));
select lives_ok(
  $$ select public.editar_local((select id from public.locais where nome = 'Praca da Se'),
       'Praca da Se (centro)', 'praca', 'Praca da Se, s/n', 'Sabados de manha', 'Feira grande') $$,
  'a autora edita o proprio local'
);
select is(
  (select status::text from public.locais where nome = 'Praca da Se (centro)'),
  'ativo',
  'editar_local nao mexe no status'
);
select is(
  (select origem::text from public.locais where nome = 'Praca da Se (centro)'),
  'manual',
  'editar_local nao mexe na origem'
);
select is(
  (select criado_por from public.locais where nome = 'Praca da Se (centro)'),
  (select ana from c),
  'editar_local nao mexe na autoria'
);

select throws_ok(
  $$ select public.arquivar_local((select id from public.locais where nome = 'Praca da Se (centro)'), 'ok') $$,
  'P0001', 'motivo_obrigatorio',
  'arquivar exige motivo com pelo menos 3 caracteres'
);
select lives_ok(
  $$ select public.arquivar_local((select id from public.locais where nome = 'Praca da Se (centro)'),
       'local fechou definitivamente') $$,
  'a autora arquiva o proprio local'
);
select is(
  (select status::text from public.locais where nome = 'Praca da Se (centro)'),
  'arquivado',
  'o local fica arquivado, nao apagado'
);
select is(
  (select motivo_arquivamento from public.locais where nome = 'Praca da Se (centro)'),
  'local fechou definitivamente',
  'o motivo do arquivamento fica gravado'
);

-- a propria autora continua vendo o local arquivado; outro voluntario, nao
select is((select count(*)::int from public.locais where nome = 'Praca da Se (centro)'), 1,
  'a autora ve o proprio local arquivado');
select pg_temp.entrar((select bruno from c));
select is((select count(*)::int from public.locais where nome = 'Praca da Se (centro)'), 0,
  'outro voluntario nao ve o local arquivado');
select pg_temp.entrar((select admin from c));
select is((select count(*)::int from public.locais where nome = 'Praca da Se (centro)'), 1,
  'o administrador ve tudo, inclusive arquivados de outros');

-- ------------------------------------------- DELETE falha em todas as tabelas
select pg_temp.entrar((select admin from c));
select throws_ok($$ delete from public.locais $$,         '42501', null, 'DELETE em locais falha');
select throws_ok($$ delete from public.perfis $$,         '42501', null, 'DELETE em perfis falha');
select throws_ok($$ delete from public.agendamentos $$,   '42501', null, 'DELETE em agendamentos falha');
select throws_ok($$ delete from public.pedidos_limite $$, '42501', null, 'DELETE em pedidos_limite falha');
select throws_ok($$ delete from public.municipios $$,     '42501', null, 'DELETE em municipios falha');
select throws_ok($$ delete from public.config $$,         '42501', null, 'DELETE em config falha');
select throws_ok($$ delete from public.historico $$,      '42501', null, 'DELETE em historico falha');
select throws_ok($$ update public.locais set nome = 'x' $$, '42501', null, 'UPDATE direto em locais falha');

reset role;
select * from finish();
rollback;
