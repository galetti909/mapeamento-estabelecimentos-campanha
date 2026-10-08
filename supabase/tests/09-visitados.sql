-- ===========================================================================
-- Locais visitados: agendamento nao cancelado com horario ja encerrado.
-- ===========================================================================
begin;
select plan(9);

create or replace function pg_temp.nova_conta(
  p_email text, p_nome text,
  p_status public.status_conta default 'ativo'
) returns uuid language plpgsql as $$
declare v_id uuid := extensions.gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, p_email, jsonb_build_object('nome_exibicao', p_nome));
  if p_status <> 'aguardando' then
    update public.perfis set status = p_status where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function pg_temp.entrar(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end $$;

create temp table c as select
  pg_temp.nova_conta('ana@exemplo.org', 'Ana')                        as ana,
  pg_temp.nova_conta('bruno@exemplo.org', 'Bruno')                    as bruno,
  pg_temp.nova_conta('espera@exemplo.org', 'Em Espera', 'aguardando') as aguardando;
grant select on c to authenticated;

-- Quatro locais em Sao Paulo:
--   1 agendamento de ontem (visitado)
--   2 agendamento de ontem, cancelado (nao visitado)
--   3 agendamento de amanha (nao visitado)
--   4 sem agendamento
insert into public.locais (id, nome, tipo, geom, status, origem, criado_por, ativado_por, ativado_em)
select ('77777777-0000-0000-0000-00000000000' || n)::uuid, 'Local ' || n, 'feira',
       extensions.st_setsrid(extensions.st_makepoint(-46.63 - n * 0.001, -23.55), 4326)::extensions.geography,
       'ativo', 'manual', c.ana, c.ana, now()
from c, generate_series(1, 4) as n;

-- Agendamentos no passado nao passam pela RPC agendar (que so aceita de hoje
-- em diante): entram direto na tabela, como se tivessem sido feitos antes.
insert into public.agendamentos (local_id, perfil_id, dia, hora_inicio, hora_fim)
select '77777777-0000-0000-0000-000000000001', c.bruno, public.hoje_brasilia() - 1, '09:00', '11:00' from c;
insert into public.agendamentos (local_id, perfil_id, dia, hora_inicio, hora_fim, cancelado_em, cancelado_por)
select '77777777-0000-0000-0000-000000000002', c.bruno, public.hoje_brasilia() - 1, '09:00', '11:00', now(), c.bruno from c;
insert into public.agendamentos (local_id, perfil_id, dia, hora_inicio, hora_fim)
select '77777777-0000-0000-0000-000000000003', c.bruno, public.hoje_brasilia() + 1, '09:00', '11:00' from c;

set role authenticated;
-- Ana nao se agendou em nada, mas enxerga o que os outros ja visitaram.
select pg_temp.entrar((select ana from c));

select is(
  (select visitado from public.locais_na_area(-47.0, -24.0, -46.0, -23.0, 12)
    where id = '77777777-0000-0000-0000-000000000001'),
  true,
  'agendamento encerrado deixa o local visitado, para qualquer voluntario'
);
select is(
  (select visitado from public.locais_na_area(-47.0, -24.0, -46.0, -23.0, 12)
    where id = '77777777-0000-0000-0000-000000000002'),
  false,
  'agendamento cancelado nao conta como visita'
);
select is(
  (select visitado from public.locais_na_area(-47.0, -24.0, -46.0, -23.0, 12)
    where id = '77777777-0000-0000-0000-000000000003'),
  false,
  'agendamento futuro nao conta como visita'
);
select is(
  (select visitado from public.locais_na_area(-47.0, -24.0, -46.0, -23.0, 12)
    where id = '77777777-0000-0000-0000-000000000004'),
  false,
  'local sem agendamento nao e visitado'
);
select is(
  (select sum(visitados)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 4)),
  1,
  'no zoom afastado a contagem por municipio traz quantos foram visitados'
);
select is(
  public.local_foi_visitado('77777777-0000-0000-0000-000000000001'),
  true,
  'local_foi_visitado confirma o local visitado'
);
select is(
  public.local_foi_visitado('77777777-0000-0000-0000-000000000004'),
  false,
  'local_foi_visitado nega o local sem visita'
);

-- Conta aguardando nao fica sabendo de nada.
select pg_temp.entrar((select aguardando from c));
select is(
  (select count(*)::int from public.locais_visitados()),
  0,
  'conta nao liberada nao recebe a lista de visitados'
);

reset role;
set role anon;
select throws_ok(
  $$ select public.locais_visitados() $$,
  '42501',
  null,
  'anon nao executa locais_visitados'
);

reset role;
select * from finish();
rollback;
