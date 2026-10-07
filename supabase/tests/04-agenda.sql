-- ===========================================================================
-- Agenda (criterios de aceite "Agenda").
-- ===========================================================================
begin;
select plan(30);

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

insert into public.locais (id, nome, tipo, geom, status, origem, criado_por, ativado_por, ativado_em)
select '22222222-2222-2222-2222-222222222222', 'Feira do Centro', 'feira',
       extensions.st_setsrid(extensions.st_makepoint(-46.6333, -23.5505), 4326)::extensions.geography,
       'ativo', 'manual', c.ana, c.ana, now()
from c;

insert into public.locais (id, nome, tipo, geom, status, origem, origem_id)
values ('33333333-3333-3333-3333-333333333333', 'Feira Importada', 'feira',
        extensions.st_setsrid(extensions.st_makepoint(-46.64, -23.56), 4326)::extensions.geography,
        'importado', 'osm', 'node/9');

set role authenticated;
select pg_temp.entrar((select ana from c));

-- ---------------------------------------------------------------- agendar
select lives_ok(
  $$ select public.agendar('22222222-2222-2222-2222-222222222222',
       public.hoje_brasilia(), '08:00', '10:00') $$,
  'conta ativa se agenda num local ativo'
);

select throws_ok(
  $$ select public.agendar('33333333-3333-3333-3333-333333333333',
       public.hoje_brasilia(), '08:00', '10:00') $$,
  'P0001', 'local_nao_ativo',
  'nao da para se agendar num local importado'
);

-- janela de hoje a 60 dias
select throws_ok(
  $$ select public.agendar('22222222-2222-2222-2222-222222222222',
       public.hoje_brasilia() - 1, '08:00', '10:00') $$,
  'P0001', 'dia_fora_da_janela',
  'dia no passado e recusado'
);
select throws_ok(
  $$ select public.agendar('22222222-2222-2222-2222-222222222222',
       public.hoje_brasilia() + 61, '08:00', '10:00') $$,
  'P0001', 'dia_fora_da_janela',
  'dia a mais de 60 dias e recusado'
);
select lives_ok(
  $$ select public.agendar('22222222-2222-2222-2222-222222222222',
       public.hoje_brasilia() + 60, '08:00', '10:00') $$,
  'dia exatamente a 60 dias e aceito'
);

-- horario
select throws_ok(
  $$ select public.agendar('22222222-2222-2222-2222-222222222222',
       public.hoje_brasilia() + 1, '10:00', '08:00') $$,
  'P0001', 'horario_invalido',
  'hora de fim menor que a de inicio e recusada'
);
select throws_ok(
  $$ select public.agendar('22222222-2222-2222-2222-222222222222',
       public.hoje_brasilia() + 1, '10:00', '10:00') $$,
  'P0001', 'horario_invalido',
  'hora de fim igual a de inicio e recusada'
);

-- sobreposicao
select throws_ok(
  $$ select public.agendar('22222222-2222-2222-2222-222222222222',
       public.hoje_brasilia(), '09:00', '11:00') $$,
  'P0001', 'agendamento_sobreposto',
  'agendamento sobreposto do mesmo usuario no mesmo local e dia e recusado'
);
select lives_ok(
  $$ select public.agendar('22222222-2222-2222-2222-222222222222',
       public.hoje_brasilia(), '10:00', '12:00') $$,
  'faixa encostada (10:00-12:00 depois de 08:00-10:00) e aceita'
);

-- outro usuario pode usar o mesmo horario
select pg_temp.entrar((select bruno from c));
select lives_ok(
  $$ select public.agendar('22222222-2222-2222-2222-222222222222',
       public.hoje_brasilia(), '08:00', '10:00') $$,
  'outra pessoa pode se agendar no mesmo horario e local'
);

-- -------------------------------------------------------- agenda do local
select is(
  (select count(*)::int from public.agenda_do_local('22222222-2222-2222-2222-222222222222')),
  4,
  'a agenda do local mostra os quatro agendamentos futuros'
);

select bag_eq(
  $$ select nome_exibicao from public.agenda_do_local('22222222-2222-2222-2222-222222222222') $$,
  $$ values ('Ana'), ('Ana'), ('Ana'), ('Bruno') $$,
  'a agenda devolve os nomes de exibicao de quem se agendou'
);

-- Nenhuma outra informacao de outro usuario sai do banco: a assinatura da
-- funcao e a propria garantia.
select is(
  (select pg_get_function_result(p.oid) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'agenda_do_local'),
  'TABLE(id uuid, dia date, hora_inicio time without time zone, '
    || 'hora_fim time without time zone, nome_exibicao text, meu boolean)',
  'a agenda devolve somente id, dia, horario, nome de exibicao e se e o meu'
);

select is(
  (select count(*)::int from public.agenda_do_local('22222222-2222-2222-2222-222222222222') where meu),
  1,
  'Bruno ve apenas o proprio agendamento marcado como seu'
);

-- nenhuma outra informacao de outro usuario sai do banco
select is(
  (select count(*)::int from public.agendamentos),
  1,
  'pela tabela, o voluntario le somente os proprios agendamentos'
);

select is(
  (select count(*)::int from public.meus_agendamentos()),
  1,
  'meus_agendamentos devolve so os do proprio usuario'
);

-- ------------------------------------------------- ninguem agenda por outro
-- agendar() usa sempre auth.uid(): nao existe parametro de perfil.
select is(
  (select count(*)::int from information_schema.parameters
   where specific_schema = 'public'
     and specific_name in (select specific_name from information_schema.routines
                            where routine_schema = 'public' and routine_name = 'agendar')
     and parameter_name ilike '%perfil%'),
  0,
  'agendar() nao tem parametro de perfil: ninguem agenda outra pessoa'
);

select is(
  (select perfil_id from public.agendamentos),
  (select bruno from c),
  'o agendamento criado pertence a quem chamou a funcao'
);

-- ------------------------------------------------------------ cancelamento
select throws_ok(
  $$ select public.cancelar_agendamento(
       (select id from public.agenda_do_local('22222222-2222-2222-2222-222222222222')
        where not meu limit 1)) $$,
  'P0001', 'sem_permissao',
  'voluntario nao cancela agendamento de outra pessoa'
);

select lives_ok(
  $$ select public.cancelar_agendamento(
       (select id from public.agendamentos where perfil_id = (select bruno from c))) $$,
  'o dono cancela o proprio agendamento'
);

select is(
  (select count(*)::int from public.meus_agendamentos()),
  0,
  'o agendamento cancelado sai da lista'
);

select is(
  (select count(*)::int from public.agendamentos where cancelado_em is not null),
  1,
  'o agendamento e cancelado, nao apagado'
);

-- administrador cancela o de outra pessoa
select pg_temp.entrar((select admin from c));
select is(
  (select count(*)::int from public.agenda_do_local('22222222-2222-2222-2222-222222222222')),
  3,
  'a agenda ja nao mostra o agendamento cancelado'
);
select lives_ok(
  $$ select public.cancelar_agendamento(
       (select id from public.agenda_do_local('22222222-2222-2222-2222-222222222222') limit 1)) $$,
  'administrador cancela o agendamento de outra pessoa'
);

-- --------------------------- arquivar o local cancela os agendamentos futuros
select pg_temp.entrar((select ana from c));
select is(
  (select count(*)::int from public.agenda_do_local('22222222-2222-2222-2222-222222222222')),
  2,
  'sobraram dois agendamentos futuros antes do arquivamento'
);
select lives_ok(
  $$ select public.arquivar_local('22222222-2222-2222-2222-222222222222', 'feira encerrada') $$,
  'a autora arquiva o local'
);
select is(
  (select count(*)::int from public.agendamentos
   where local_id = '22222222-2222-2222-2222-222222222222'
     and cancelado_em is null),
  0,
  'arquivar um local cancela todos os agendamentos futuros dele'
);
select is(
  (select count(*)::int from public.meus_agendamentos()),
  0,
  'os agendamentos futuros da autora tambem foram cancelados'
);

-- -------------------------------------------- conta nao ativa nao ve a agenda
reset role;
update public.perfis set status = 'bloqueado' where id = (select bruno from c);
set role authenticated;
select pg_temp.entrar((select bruno from c));
select throws_ok(
  $$ select public.agenda_do_local('22222222-2222-2222-2222-222222222222') $$,
  'P0001', 'conta_nao_ativa',
  'conta bloqueada nao le a agenda de nenhum local'
);
select throws_ok(
  $$ select public.meus_agendamentos() $$,
  'P0001', 'conta_nao_ativa',
  'conta bloqueada nao le os proprios agendamentos'
);

reset role;
select * from finish();
rollback;
