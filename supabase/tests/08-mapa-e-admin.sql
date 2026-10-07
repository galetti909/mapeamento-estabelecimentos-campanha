-- ===========================================================================
-- Carga do mapa, ficha do local, senha temporaria e listagens do
-- administrador.
-- ===========================================================================
begin;
select plan(34);

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
  pg_temp.nova_conta('admin@exemplo.org', 'Admin', 'ativo', 'admin')  as admin,
  pg_temp.nova_conta('ana@exemplo.org', 'Ana')                        as ana,
  pg_temp.nova_conta('bruno@exemplo.org', 'Bruno')                    as bruno,
  pg_temp.nova_conta('espera@exemplo.org', 'Em Espera', 'aguardando') as aguardando;
grant select on c to authenticated;

-- Tres locais em Sao Paulo, um no Rio e um importado.
insert into public.locais (id, nome, tipo, geom, status, origem, criado_por, ativado_por, ativado_em)
select '66666666-0000-0000-0000-000000000001', 'Feira da Se', 'feira',
       extensions.st_setsrid(extensions.st_makepoint(-46.6333, -23.5505), 4326)::extensions.geography,
       'ativo', 'manual', c.ana, c.ana, now() from c;
insert into public.locais (id, nome, tipo, geom, status, origem, criado_por, ativado_por, ativado_em)
select '66666666-0000-0000-0000-000000000002', 'Padaria do Centro', 'padaria',
       extensions.st_setsrid(extensions.st_makepoint(-46.6400, -23.5600), 4326)::extensions.geography,
       'ativo', 'manual', c.ana, c.ana, now() from c;
insert into public.locais (id, nome, tipo, geom, status, origem, criado_por, ativado_por, ativado_em)
select '66666666-0000-0000-0000-000000000003', 'Bar do Leblon', 'bar',
       extensions.st_setsrid(extensions.st_makepoint(-43.2200, -22.9850), 4326)::extensions.geography,
       'ativo', 'manual', c.bruno, c.bruno, now() from c;
insert into public.locais (id, nome, tipo, geom, status, origem, origem_id)
values ('66666666-0000-0000-0000-000000000004', 'Mercado Importado', 'mercado',
        extensions.st_setsrid(extensions.st_makepoint(-46.6500, -23.5700), 4326)::extensions.geography,
        'importado', 'osm', 'node/500');

set role authenticated;
select pg_temp.entrar((select ana from c));

-- ----------------------------------------------------------- locais_na_area
select is(
  (select count(*)::int from public.locais_na_area(-47.0, -24.1, -46.0, -23.0, 12)),
  2,
  'locais_na_area devolve os locais ativos dentro da area pedida'
);
select is(
  (select count(*)::int from public.locais_na_area(-47.0, -24.1, -46.0, -23.0, 12,
     array['ativo','importado']::public.status_local[])),
  3,
  'com a camada de importados ligada, o importado tambem aparece'
);
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12)),
  3,
  'uma area cobrindo o Brasil devolve todos os locais ativos'
);
select is(
  (select modo from public.locais_na_area(-47.0, -24.1, -46.0, -23.0, 12) limit 1),
  'ponto',
  'com zoom proximo, a funcao devolve pontos'
);
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 4)),
  2,
  'com zoom muito afastado, a funcao devolve uma linha por municipio'
);
select is(
  (select modo from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 4) limit 1),
  'contagem',
  'com zoom muito afastado, o modo e contagem'
);
select is(
  (select quantidade from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 4)
   where municipio_nome = 'São Paulo'),
  2,
  'a contagem por municipio soma os locais de Sao Paulo'
);

-- filtros
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12,
     array['ativo']::public.status_local[], array['feira']::public.tipo_local[])),
  1,
  'o filtro de tipo funciona'
);
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12,
     array['ativo']::public.status_local[], null, 'RJ')),
  1,
  'o filtro de UF funciona'
);
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12,
     array['ativo']::public.status_local[], null, null, 3550308)),
  2,
  'o filtro de municipio funciona'
);
select is(
  (select nome from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12,
     array['ativo']::public.status_local[], null, null, null, 'padaria')),
  'Padaria do Centro',
  'a busca por nome de local funciona'
);
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12,
     array['ativo']::public.status_local[], null, null, null, 'Leblon')),
  1,
  'a busca encontra o local pelo nome parcial'
);

-- filtro "com agendamento nos proximos 7 dias"
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12,
     array['ativo']::public.status_local[], null, null, null, null, true)),
  0,
  'sem agendamentos, o filtro de agenda nao devolve nada'
);
select lives_ok(
  $$ select public.agendar('66666666-0000-0000-0000-000000000001',
       public.hoje_brasilia() + 2, '08:00', '10:00') $$,
  'a voluntaria se agenda num local'
);
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12,
     array['ativo']::public.status_local[], null, null, null, null, true)),
  1,
  'o filtro de agenda devolve o local com agendamento nos proximos 7 dias'
);
select lives_ok(
  $$ select public.agendar('66666666-0000-0000-0000-000000000002',
       public.hoje_brasilia() + 30, '08:00', '10:00') $$,
  'a voluntaria se agenda para daqui a 30 dias'
);
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12,
     array['ativo']::public.status_local[], null, null, null, null, true)),
  1,
  'agendamento a 30 dias nao entra no filtro de 7 dias'
);

-- o limite de 3.000 por chamada nao pode ser ultrapassado
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12,
     array['ativo']::public.status_local[], null, null, null, null, false, 99999)),
  3,
  'o parametro de limite e preso a 3.000 e nunca excede a base'
);

-- conta nao ativa nao carrega o mapa
select pg_temp.entrar((select aguardando from c));
select is(
  (select count(*)::int from public.locais_na_area(-75.0, -34.0, -34.0, 6.0, 12)),
  0,
  'conta aguardando nao carrega nenhum ponto do mapa (locais_na_area respeita o RLS)'
);

-- ------------------------------------------------------------ local_detalhe
select pg_temp.entrar((select ana from c));
select is(
  (select nome from public.local_detalhe('66666666-0000-0000-0000-000000000001')),
  'Feira da Se',
  'local_detalhe devolve a ficha do local'
);
select is(
  (select municipio_nome from public.local_detalhe('66666666-0000-0000-0000-000000000001')),
  'São Paulo',
  'a ficha mostra o municipio'
);
select is(
  (select posso_alterar from public.local_detalhe('66666666-0000-0000-0000-000000000001')),
  true,
  'a autora pode alterar o proprio local'
);
select is(
  (select posso_alterar from public.local_detalhe('66666666-0000-0000-0000-000000000003')),
  false,
  'a voluntaria nao pode alterar o local de outra pessoa'
);
select pg_temp.entrar((select admin from c));
select is(
  (select posso_alterar from public.local_detalhe('66666666-0000-0000-0000-000000000003')),
  true,
  'o administrador pode alterar qualquer local'
);

-- ------------------------------------------------------ admin_listar_contas
select is(
  (select count(*)::int from public.admin_listar_contas()),
  4,
  'admin_listar_contas devolve todas as contas'
);
select is(
  (select email from public.admin_listar_contas(null, 'Ana')),
  'ana@exemplo.org',
  'admin_listar_contas devolve o e-mail, que nao existe em nenhuma tabela exposta'
);
select is(
  (select count(*)::int from public.admin_listar_contas('aguardando')),
  1,
  'admin_listar_contas filtra por status'
);
select is(
  (select locais_ativos from public.admin_listar_contas(null, 'Ana')),
  2,
  'admin_listar_contas conta os locais ativos da conta'
);
select is(
  (select contas_aguardando from public.admin_contadores()),
  1,
  'admin_contadores conta as contas aguardando liberacao'
);

select pg_temp.entrar((select ana from c));
select throws_ok(
  $$ select public.admin_listar_contas() $$,
  'P0001', 'somente_admin',
  'voluntario nao lista contas'
);
select is(
  (select count(*)::int from public.perfis),
  1,
  'pela tabela, o voluntario le somente o proprio perfil'
);

-- ---------------------------------------------------------- senha temporaria
-- A senha em si e definida pela Edge Function admin-usuarios, que marca
-- trocar_senha no perfil; aqui conferimos o efeito e o fechamento do ciclo.
reset role;
update public.perfis set trocar_senha = true where id = (select ana from c);
set role authenticated;
select pg_temp.entrar((select ana from c));

select is(
  (select trocar_senha from public.perfis where id = (select ana from c)),
  true,
  'a senha temporaria obriga a troca no proximo login'
);
select lives_ok(
  $$ select public.trocar_minha_senha_concluida() $$,
  'o usuario conclui a troca de senha'
);
select is(
  (select trocar_senha from public.perfis where id = (select ana from c)),
  false,
  'concluir a troca desliga a marca trocar_senha'
);

reset role;
select * from finish();
rollback;
