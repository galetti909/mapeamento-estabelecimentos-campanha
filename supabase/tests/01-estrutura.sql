-- ===========================================================================
-- Estrutura: tipos, tabelas, indices, RLS ligado e privilegios revogados.
-- ===========================================================================
begin;
select plan(75);

-- ------------------------------------------------------------------ tipos
select has_type('public', 'papel', 'tipo papel existe');
select has_type('public', 'status_conta', 'tipo status_conta existe');
select has_type('public', 'status_local', 'tipo status_local existe');
select has_type('public', 'origem_local', 'tipo origem_local existe');
select has_type('public', 'tipo_local', 'tipo tipo_local existe');
select has_type('public', 'status_pedido', 'tipo status_pedido existe');

select enum_has_labels('public', 'papel', array['admin', 'voluntario'], 'papel tem os dois papeis');
select enum_has_labels('public', 'status_conta', array['aguardando', 'ativo', 'recusado', 'bloqueado'],
  'status_conta tem os quatro status');
select enum_has_labels('public', 'status_local', array['importado', 'ativo', 'arquivado'],
  'status_local tem os tres status');
select enum_has_labels('public', 'origem_local', array['osm', 'manual', 'dados_abertos'],
  'origem_local tem as tres origens');
select enum_has_labels('public', 'tipo_local',
  array['feira', 'praca', 'parque', 'mercado', 'padaria', 'bar', 'cafe', 'restaurante',
        'comercio', 'terminal', 'outro'],
  'tipo_local tem os onze tipos da especificacao');
select enum_has_labels('public', 'status_pedido', array['aberto', 'aprovado', 'recusado'],
  'status_pedido tem os tres status');

-- --------------------------------------------------------------- tabelas
select has_table('public', 'perfis', 'tabela perfis existe');
select has_table('public', 'municipios', 'tabela municipios existe');
select has_table('public', 'locais', 'tabela locais existe');
select has_table('public', 'agendamentos', 'tabela agendamentos existe');
select has_table('public', 'pedidos_limite', 'tabela pedidos_limite existe');
select has_table('public', 'historico', 'tabela historico existe');
select has_table('public', 'config', 'tabela config existe');

select is(
  (select count(*)::int from pg_tables where schemaname = 'public'),
  7,
  'sao exatamente sete tabelas no schema public'
);

-- ------------------------------------------------------------------- RLS
select is_empty(
  $$ select relname::text from pg_class
     where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity $$,
  'RLS esta ligado em todas as sete tabelas'
);

-- ------------------------------------------------- privilegios de escrita
select is_empty(
  $$ select table_name::text || '/' || privilege_type::text
     from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE') $$,
  'anon e authenticated nao tem INSERT, UPDATE, DELETE nem TRUNCATE em nenhuma tabela'
);

select is_empty(
  $$ select table_name::text from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon' $$,
  'anon nao tem privilegio nenhum em nenhuma tabela'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'SELECT'),
  7,
  'authenticated tem SELECT nas sete tabelas'
);

select is_empty(
  $$ select r.routine_name::text
     from information_schema.routine_privileges r
     where r.specific_schema = 'public' and r.grantee = 'anon' $$,
  'anon nao executa nenhuma funcao do schema public'
);

select ok(
  not has_schema_privilege('anon', 'public', 'usage'),
  'anon nao tem USAGE no schema public'
);

-- --------------------------------------------------------------- colunas
select has_column('public', 'perfis', 'nome_exibicao', 'perfis.nome_exibicao');
select has_column('public', 'perfis', 'papel', 'perfis.papel');
select has_column('public', 'perfis', 'status', 'perfis.status');
select has_column('public', 'perfis', 'sem_limite', 'perfis.sem_limite');
select has_column('public', 'perfis', 'trocar_senha', 'perfis.trocar_senha');
select hasnt_column('public', 'perfis', 'email', 'o e-mail NAO fica em perfis');

select has_column('public', 'locais', 'geom', 'locais.geom');
select has_column('public', 'locais', 'municipio_id', 'locais.municipio_id');
select has_column('public', 'locais', 'uf', 'locais.uf');
select has_column('public', 'locais', 'osm_tags', 'locais.osm_tags');
select has_column('public', 'locais', 'motivo_arquivamento', 'locais.motivo_arquivamento');
select hasnt_column('public', 'agendamentos', 'observacoes', 'agendamentos nao tem campo de texto livre');

-- --------------------------------------------------------------- indices
select has_index('public', 'locais', 'locais_geom_idx', 'indice GIST em locais.geom');
select has_index('public', 'locais', 'locais_status_idx', 'indice em locais.status');
select has_index('public', 'locais', 'locais_uf_idx', 'indice em locais.uf');
select has_index('public', 'locais', 'locais_municipio_idx', 'indice em locais.municipio_id');
select has_index('public', 'locais', 'locais_ativador_idx', 'indice em (ativado_por, ativado_em)');
select has_index('public', 'locais', 'locais_origem_unica', 'chave unica de (origem, origem_id)');
select has_index('public', 'municipios', 'municipios_geom_idx', 'indice GIST em municipios.geom');
select has_index('public', 'perfis', 'perfis_nome_exibicao_unico', 'nome de exibicao unico');
select has_index('public', 'pedidos_limite', 'pedidos_limite_um_aberto', 'um pedido aberto por perfil');

-- --------------------------------------------------------------- funcoes
select has_function('public', 'conta_ativa', 'funcao conta_ativa');
select has_function('public', 'sou_admin', 'funcao sou_admin');
select has_function('public', 'checar_escrita', 'funcao checar_escrita');
select has_function('public', 'checar_limite', 'funcao checar_limite');
select has_function('public', 'marcar_local', 'funcao marcar_local');
select has_function('public', 'ativar_importado', 'funcao ativar_importado');
select has_function('public', 'editar_local', 'funcao editar_local');
select has_function('public', 'arquivar_local', 'funcao arquivar_local');
select has_function('public', 'restaurar_local', 'funcao restaurar_local');
select has_function('public', 'agendar', 'funcao agendar');
select has_function('public', 'cancelar_agendamento', 'funcao cancelar_agendamento');
select has_function('public', 'pedir_liberacao_limite', 'funcao pedir_liberacao_limite');
select has_function('public', 'admin_decidir_pedido', 'funcao admin_decidir_pedido');
select has_function('public', 'admin_definir_limite', 'funcao admin_definir_limite');
select has_function('public', 'admin_definir_status', 'funcao admin_definir_status');
select has_function('public', 'admin_definir_papel', 'funcao admin_definir_papel');
select has_function('public', 'admin_arquivar_locais_da_conta', 'funcao admin_arquivar_locais_da_conta');
select has_function('public', 'admin_somente_leitura', 'funcao admin_somente_leitura');
select has_function('public', 'trocar_minha_senha_concluida', 'funcao trocar_minha_senha_concluida');
select has_function('public', 'agenda_do_local', 'funcao agenda_do_local');
select has_function('public', 'admin_listar_contas', 'funcao admin_listar_contas');
select has_function('public', 'locais_na_area', 'funcao locais_na_area');

-- locais_na_area precisa respeitar o RLS: SECURITY INVOKER.
select is(
  (select p.prosecdef from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'locais_na_area'),
  false,
  'locais_na_area e SECURITY INVOKER (respeita o RLS)'
);

select ok(
  (select bool_and(p.prosecdef) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('conta_ativa', 'sou_admin', 'checar_escrita', 'checar_limite',
                       'marcar_local', 'agendar', 'agenda_do_local', 'admin_listar_contas')),
  'as funcoes de escrita e as de leitura privilegiada sao SECURITY DEFINER'
);

select ok(
  (select bool_and(p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef),
  'toda funcao SECURITY DEFINER tem search_path fixo'
);

-- --------------------------------- disciplina das funcoes de escrita
-- Toda funcao RPC de escrita confere o modo somente leitura e deixa rastro no
-- historico (direto ou pelo trigger, via app.acao).
select is_empty(
  $$ select p.proname::text
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         'marcar_local', 'ativar_importado', 'editar_local', 'arquivar_local',
         'restaurar_local', 'agendar', 'cancelar_agendamento',
         'pedir_liberacao_limite', 'admin_decidir_pedido', 'admin_definir_limite',
         'admin_definir_status', 'admin_definir_papel',
         'admin_arquivar_locais_da_conta', 'admin_somente_leitura',
         'trocar_minha_senha_concluida'
       )
       and p.prosrc not like '%checar_escrita()%' $$,
  'toda funcao RPC de escrita chama checar_escrita()'
);

select is_empty(
  $$ select p.proname::text
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         'marcar_local', 'ativar_importado', 'editar_local', 'arquivar_local',
         'restaurar_local', 'agendar', 'cancelar_agendamento',
         'pedir_liberacao_limite', 'admin_decidir_pedido', 'admin_definir_limite',
         'admin_definir_status', 'admin_definir_papel',
         'admin_arquivar_locais_da_conta', 'admin_somente_leitura',
         'trocar_minha_senha_concluida'
       )
       and p.prosrc not like '%app.acao%' $$,
  'toda funcao RPC de escrita identifica a acao para o historico'
);

-- Nenhuma funcao de escrita apaga linha de tabela nenhuma.
select is_empty(
  $$ select p.proname::text
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosrc ~* '(^|[^[:alnum:]_])delete[[:space:]]+from[[:space:]]+public\.' $$,
  'nenhuma funcao do schema public apaga linhas (nada e excluido, so arquivado)'
);

select * from finish();
rollback;
