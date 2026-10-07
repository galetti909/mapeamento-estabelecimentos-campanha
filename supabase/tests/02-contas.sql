-- ===========================================================================
-- Contas, papeis e permissoes (criterios de aceite "Contas").
-- Os testes trocam de papel com "set role authenticated" e definem
-- request.jwt.claims exatamente como o PostgREST faz, de modo que o RLS e
-- avaliado como numa chamada direta a API REST.
-- ===========================================================================
begin;
select plan(44);

-- --------------------------------------------------------------- apoio
create or replace function pg_temp.nova_conta(
  p_email  text,
  p_nome   text,
  p_status public.status_conta default 'ativo',
  p_papel  public.papel default 'voluntario'
) returns uuid language plpgsql as $$
declare
  v_id uuid := extensions.gen_random_uuid();
begin
  -- Equivale a inscricao pelo Supabase Auth: o trigger cria o perfil.
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

create or replace function pg_temp.sair() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end $$;

-- --------------------------------------------- 1. inscricao nasce aguardando
select lives_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('11111111-1111-1111-1111-111111111111', 'nova@exemplo.org',
             '{"nome_exibicao": "Pessoa Nova"}'::jsonb) $$,
  'a inscricao cria o usuario em auth.users'
);

select is(
  (select status::text from public.perfis where id = '11111111-1111-1111-1111-111111111111'),
  'aguardando',
  'a conta nasce com status aguardando'
);

select is(
  (select papel::text from public.perfis where id = '11111111-1111-1111-1111-111111111111'),
  'voluntario',
  'a conta nasce com papel voluntario'
);

select is(
  (select nome_exibicao from public.perfis where id = '11111111-1111-1111-1111-111111111111'),
  'Pessoa Nova',
  'o nome de exibicao vem dos metadados da inscricao'
);

select is(
  (select count(*)::int from auth.identities
   where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'nenhum e-mail de confirmacao e disparado pelo app (nada em auth a confirmar)'
);

-- nome de exibicao unico, sem diferenciar maiusculas
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values (extensions.gen_random_uuid(), 'outra@exemplo.org',
             '{"nome_exibicao": "pessoa nova"}'::jsonb) $$,
  'P0001', 'nome_exibicao_em_uso',
  'nome de exibicao repetido (outra caixa) e recusado'
);

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values (extensions.gen_random_uuid(), 'curta@exemplo.org',
             '{"nome_exibicao": "X"}'::jsonb) $$,
  'P0001', 'nome_exibicao_tamanho',
  'nome de exibicao com menos de 2 caracteres e recusado'
);

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values (extensions.gen_random_uuid(), 'sem-nome@exemplo.org', '{}'::jsonb) $$,
  'P0001', 'nome_exibicao_obrigatorio',
  'inscricao sem nome de exibicao e recusada'
);

-- e-mail repetido
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values (extensions.gen_random_uuid(), 'nova@exemplo.org',
             '{"nome_exibicao": "Outro Nome"}'::jsonb) $$,
  '23505', null,
  'inscricao com e-mail ja usado e recusada'
);

-- --------------------------------------------------------------- contas
create temp table c as
select
  pg_temp.nova_conta('admin@exemplo.org', 'Admin Um', 'ativo', 'admin')       as admin,
  pg_temp.nova_conta('admin2@exemplo.org', 'Admin Dois', 'ativo', 'admin')    as admin2,
  pg_temp.nova_conta('ativo@exemplo.org', 'Voluntario Ativo')                 as ativo,
  pg_temp.nova_conta('espera@exemplo.org', 'Em Espera', 'aguardando')         as aguardando,
  pg_temp.nova_conta('recusado@exemplo.org', 'Recusado', 'recusado')          as recusado,
  pg_temp.nova_conta('bloqueado@exemplo.org', 'Bloqueado', 'bloqueado')       as bloqueado;

-- um local ativo para os testes de leitura
insert into public.locais (nome, tipo, geom, status, origem, criado_por, ativado_por, ativado_em)
select 'Feira da Praca', 'feira',
       extensions.st_setsrid(extensions.st_makepoint(-46.6333, -23.5505), 4326)::extensions.geography,
       'ativo', 'manual', c.ativo, c.ativo, now()
from c;

grant select on c to authenticated, anon;

-- ------------------------------- 2. conta nao liberada nao le nem escreve
set role authenticated;

select pg_temp.entrar((select aguardando from c));

select is((select count(*)::int from public.locais), 0,
  'conta aguardando nao le locais');
select is((select count(*)::int from public.municipios), 0,
  'conta aguardando nao le municipios');
select is((select count(*)::int from public.config), 0,
  'conta aguardando nao le config');
select is((select count(*)::int from public.historico), 0,
  'conta aguardando nao le historico');
select is((select count(*)::int from public.agendamentos), 0,
  'conta aguardando nao le agendamentos');
select is((select count(*)::int from public.pedidos_limite), 0,
  'conta aguardando nao le pedidos_limite');
select is((select count(*)::int from public.perfis), 1,
  'conta aguardando le somente o proprio perfil (para ver o status)');
select is((select id from public.perfis), (select aguardando from c),
  'o unico perfil visivel e o dela mesma');

select throws_ok(
  $$ select public.marcar_local('Praca Teste', 'praca', -23.55, -46.63) $$,
  'P0001', 'conta_nao_ativa',
  'conta aguardando nao executa marcar_local'
);
select throws_ok(
  $$ select public.agendar((select id from public.locais limit 1), current_date, '08:00', '10:00') $$,
  'P0001', 'conta_nao_ativa',
  'conta aguardando nao executa agendar'
);
select throws_ok(
  $$ select public.agenda_do_local(extensions.gen_random_uuid()) $$,
  'P0001', 'conta_nao_ativa',
  'conta aguardando nao le a agenda de um local'
);
select throws_ok(
  $$ select public.pedir_liberacao_limite() $$,
  'P0001', 'conta_nao_ativa',
  'conta aguardando nao pede liberacao de limite'
);

select pg_temp.entrar((select recusado from c));
select is((select count(*)::int from public.locais), 0, 'conta recusada nao le locais');
select throws_ok(
  $$ select public.marcar_local('Praca Teste', 'praca', -23.55, -46.63) $$,
  'P0001', 'conta_nao_ativa',
  'conta recusada nao executa marcar_local'
);

select pg_temp.entrar((select bloqueado from c));
select is((select count(*)::int from public.locais), 0, 'conta bloqueada nao le locais');
select throws_ok(
  $$ select public.marcar_local('Praca Teste', 'praca', -23.55, -46.63) $$,
  'P0001', 'conta_nao_ativa',
  'conta bloqueada nao executa marcar_local'
);

-- ------------------------------------------- 3. usuario sem login nao le nada
reset role;
set role anon;
select pg_temp.sair();

select throws_ok(
  $$ select count(*) from public.locais $$,
  '42501', null,
  'anon nao tem permissao de leitura em locais'
);
select throws_ok(
  $$ select count(*) from public.perfis $$,
  '42501', null,
  'anon nao tem permissao de leitura em perfis'
);
select throws_ok(
  $$ select public.marcar_local('Praca Teste', 'praca', -23.55, -46.63) $$,
  '42501', null,
  'anon nao executa marcar_local'
);
select throws_ok(
  $$ select public.locais_na_area(-47.0, -24.0, -46.0, -23.0, 12) $$,
  '42501', null,
  'anon nao executa locais_na_area'
);

-- ------------------------------------- 4. liberar e bloquear valem na hora
reset role;
set role authenticated;
select pg_temp.entrar((select admin from c));

select lives_ok(
  $$ select public.admin_definir_status((select aguardando from c), 'ativo') $$,
  'administrador libera a conta que aguardava'
);

select pg_temp.entrar((select aguardando from c));
select is((select count(*)::int from public.locais), 1,
  'liberar a conta da acesso na chamada seguinte');
select lives_ok(
  $$ select public.marcar_local('Praca Liberada', 'praca', -23.55, -46.63) $$,
  'conta recem-liberada ja escreve'
);

select pg_temp.entrar((select admin from c));
select lives_ok(
  $$ select public.admin_definir_status((select aguardando from c), 'bloqueado') $$,
  'administrador bloqueia a conta'
);

select pg_temp.entrar((select aguardando from c));
select is((select count(*)::int from public.locais), 0,
  'bloquear a conta corta o acesso na chamada seguinte');
select throws_ok(
  $$ select public.marcar_local('Praca Bloqueada', 'praca', -23.55, -46.63) $$,
  'P0001', 'conta_nao_ativa',
  'conta bloqueada perde a escrita na chamada seguinte'
);

-- --------------------------------- 5. protecoes do papel de administrador
select pg_temp.entrar((select admin from c));

select throws_ok(
  $$ select public.admin_definir_status((select admin from c), 'bloqueado') $$,
  'P0001', 'nao_pode_agir_sobre_si',
  'administrador nao bloqueia a si mesmo'
);
select throws_ok(
  $$ select public.admin_definir_papel((select admin from c), 'voluntario') $$,
  'P0001', 'nao_pode_agir_sobre_si',
  'administrador nao rebaixa a si mesmo'
);

-- deixa so um administrador ativo e tenta retirar o ultimo
select lives_ok(
  $$ select public.admin_definir_papel((select admin2 from c), 'voluntario') $$,
  'com dois administradores, um pode rebaixar o outro'
);

select pg_temp.entrar((select admin2 from c));
select throws_ok(
  $$ select public.admin_definir_status((select admin from c), 'bloqueado') $$,
  'P0001', 'somente_admin',
  'conta rebaixada perde os poderes de administrador na hora'
);

-- promove admin2 de volta e tenta, como admin2, retirar o ultimo admin
select pg_temp.entrar((select admin from c));
select lives_ok(
  $$ select public.admin_definir_papel((select admin2 from c), 'admin') $$,
  'administrador promove outra conta a administrador'
);
select lives_ok(
  $$ select public.admin_definir_status((select admin2 from c), 'bloqueado') $$,
  'administrador bloqueia o outro administrador'
);
select throws_ok(
  $$ select public.admin_definir_status((select admin from c), 'recusado') $$,
  'P0001', 'nao_pode_agir_sobre_si',
  'o ultimo administrador tambem nao recusa a si mesmo'
);

-- agora com um terceiro administrador agindo sobre o ultimo admin restante
reset role;
create temp table c3 as select pg_temp.nova_conta('admin3@exemplo.org', 'Admin Tres', 'ativo', 'admin') as admin3;
grant select on c3 to authenticated;
set role authenticated;
select pg_temp.entrar((select admin3 from c3));
select lives_ok(
  $$ select public.admin_definir_status((select admin from c), 'bloqueado') $$,
  'com dois administradores ativos, um pode bloquear o outro'
);
select throws_ok(
  $$ select public.admin_definir_status((select admin3 from c3), 'bloqueado') $$,
  'P0001', 'nao_pode_agir_sobre_si',
  'sobrando um unico administrador, ele nao se bloqueia'
);

reset role;
select * from finish();
rollback;
