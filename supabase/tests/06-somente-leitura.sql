-- ===========================================================================
-- Modo somente leitura (criterio "Com o modo somente leitura ligado, so o
-- administrador escreve").
-- ===========================================================================
begin;
select plan(16);

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
  pg_temp.nova_conta('ana@exemplo.org', 'Ana')                       as ana;
grant select on c to authenticated;

insert into public.locais (id, nome, tipo, geom, status, origem, criado_por, ativado_por, ativado_em)
select '44444444-4444-4444-4444-444444444444', 'Feira Base', 'feira',
       extensions.st_setsrid(extensions.st_makepoint(-46.6333, -23.5505), 4326)::extensions.geography,
       'ativo', 'manual', c.ana, c.ana, now()
from c;

insert into public.locais (id, nome, tipo, geom, status, origem, origem_id)
values ('55555555-5555-5555-5555-555555555555', 'Importado Base', 'feira',
        extensions.st_setsrid(extensions.st_makepoint(-46.64, -23.56), 4326)::extensions.geography,
        'importado', 'osm', 'node/77');

set role authenticated;

-- voluntario nao liga o modo somente leitura
select pg_temp.entrar((select ana from c));
select throws_ok(
  $$ select public.admin_somente_leitura(true) $$,
  'P0001', 'somente_admin',
  'voluntario nao liga o modo somente leitura'
);

select pg_temp.entrar((select admin from c));
select lives_ok($$ select public.admin_somente_leitura(true) $$,
  'administrador liga o modo somente leitura');
select is((select somente_leitura from public.config), true,
  'config.somente_leitura fica ligado');

-- voluntario perde toda a escrita
select pg_temp.entrar((select ana from c));
select throws_ok(
  $$ select public.marcar_local('Nova Feira', 'feira', -23.55, -46.63) $$,
  'P0001', 'somente_leitura', 'voluntario nao marca local');
select throws_ok(
  $$ select public.ativar_importado('55555555-5555-5555-5555-555555555555') $$,
  'P0001', 'somente_leitura', 'voluntario nao ativa importado');
select throws_ok(
  $$ select public.editar_local('44444444-4444-4444-4444-444444444444', 'Outro Nome', 'feira') $$,
  'P0001', 'somente_leitura', 'voluntario nao edita local');
select throws_ok(
  $$ select public.arquivar_local('44444444-4444-4444-4444-444444444444', 'motivo qualquer') $$,
  'P0001', 'somente_leitura', 'voluntario nao arquiva local');
select throws_ok(
  $$ select public.agendar('44444444-4444-4444-4444-444444444444', public.hoje_brasilia(), '08:00', '10:00') $$,
  'P0001', 'somente_leitura', 'voluntario nao se agenda');
select throws_ok(
  $$ select public.pedir_liberacao_limite() $$,
  'P0001', 'somente_leitura', 'voluntario nao pede liberacao de limite');

-- a leitura continua funcionando
select is((select count(*)::int from public.locais), 2,
  'o voluntario continua lendo os locais no modo somente leitura');
select lives_ok(
  $$ select public.agenda_do_local('44444444-4444-4444-4444-444444444444') $$,
  'o voluntario continua lendo a agenda no modo somente leitura'
);

-- o administrador continua escrevendo
select pg_temp.entrar((select admin from c));
select lives_ok(
  $$ select public.marcar_local('Feira do Admin', 'feira', -23.55, -46.63) $$,
  'o administrador continua marcando locais no modo somente leitura'
);
select lives_ok(
  $$ select public.arquivar_local('44444444-4444-4444-4444-444444444444', 'ataque em andamento') $$,
  'o administrador continua arquivando no modo somente leitura'
);
select lives_ok(
  $$ select public.admin_definir_status((select ana from c), 'bloqueado') $$,
  'o administrador continua bloqueando contas no modo somente leitura'
);

-- desligar devolve a escrita
select lives_ok($$ select public.admin_somente_leitura(false) $$,
  'administrador desliga o modo somente leitura');
reset role;
update public.perfis set status = 'ativo' where id = (select ana from c);
set role authenticated;
select pg_temp.entrar((select ana from c));
select lives_ok(
  $$ select public.marcar_local('Volta ao Normal', 'feira', -23.55, -46.63) $$,
  'desligar o modo somente leitura devolve a escrita ao voluntario'
);

reset role;
select * from finish();
rollback;
