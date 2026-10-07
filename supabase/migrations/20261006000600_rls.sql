-- ===========================================================================
-- Mapa de Campanha - 06 - RLS, revogacoes e politicas de leitura
--
-- Principios:
--  1. RLS ligado em todas as tabelas, negando tudo por padrao.
--  2. INSERT/UPDATE/DELETE revogados para anon e authenticated: toda escrita
--     passa por funcao SECURITY DEFINER.
--  3. historico e preenchido por trigger e recusa UPDATE/DELETE.
--  4. anon nao le nada e nao executa nenhuma funcao do schema public.
--  5. Conta que nao esteja 'ativo' so consulta o proprio status.
-- ===========================================================================

alter table public.perfis         enable row level security;
alter table public.municipios     enable row level security;
alter table public.locais         enable row level security;
alter table public.agendamentos   enable row level security;
alter table public.pedidos_limite enable row level security;
alter table public.historico      enable row level security;
alter table public.config         enable row level security;

-- --------------------------------------------------------------------------
-- Privilegios de tabela: somente SELECT, e somente para authenticated.
-- --------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.perfis         to authenticated;
grant select on public.municipios     to authenticated;
grant select on public.locais         to authenticated;
grant select on public.agendamentos   to authenticated;
grant select on public.pedidos_limite to authenticated;
grant select on public.historico      to authenticated;
grant select on public.config         to authenticated;

-- A sequencia do historico nao precisa estar acessivel ao cliente.
revoke all on all sequences in schema public from anon, authenticated;

-- --------------------------------------------------------------------------
-- Nas politicas, cada chamada de funcao vai dentro de (select ...). Isso faz
-- o Postgres avaliar conta_ativa(), sou_admin() e auth.uid() UMA vez por
-- consulta, como InitPlan, em vez de uma vez por linha. Sem isso, uma carga
-- de mapa com 50 mil locais chamaria conta_ativa() 50 mil vezes.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- perfis: cada um le somente o proprio perfil, mesmo sem estar ativo (precisa
-- enxergar o proprio status). Administradores leem todos por
-- public.admin_listar_contas(), nunca pela tabela.
-- --------------------------------------------------------------------------
create policy perfis_leitura_propria on public.perfis
  for select to authenticated
  using (id = (select auth.uid()));

-- --------------------------------------------------------------------------
-- municipios e config: leitura para contas ativas.
-- --------------------------------------------------------------------------
create policy municipios_leitura on public.municipios
  for select to authenticated
  using ((select public.conta_ativa()));

create policy config_leitura on public.config
  for select to authenticated
  using ((select public.conta_ativa()));

-- --------------------------------------------------------------------------
-- locais: contas ativas veem 'ativo' e 'importado', mais os proprios
-- arquivados; administrador ve tudo.
-- --------------------------------------------------------------------------
create policy locais_leitura on public.locais
  for select to authenticated
  using (
    (select public.conta_ativa())
    and (
      status in ('ativo', 'importado')
      or criado_por  = (select auth.uid())
      or ativado_por = (select auth.uid())
      or (select public.sou_admin())
    )
  );

-- --------------------------------------------------------------------------
-- agendamentos: cada um le somente os proprios (tela "Meus agendamentos").
-- A agenda de um local sai exclusivamente por public.agenda_do_local(), que
-- devolve apenas dia, horario e nome de exibicao.
-- O administrador le todos porque precisa cancelar e exportar a base.
-- --------------------------------------------------------------------------
create policy agendamentos_leitura on public.agendamentos
  for select to authenticated
  using (
    (select public.conta_ativa())
    and (perfil_id = (select auth.uid()) or (select public.sou_admin()))
  );

-- --------------------------------------------------------------------------
-- pedidos_limite: administrador le tudo; voluntario le so os proprios.
-- --------------------------------------------------------------------------
create policy pedidos_limite_leitura on public.pedidos_limite
  for select to authenticated
  using (
    (select public.conta_ativa())
    and (perfil_id = (select auth.uid()) or (select public.sou_admin()))
  );

-- --------------------------------------------------------------------------
-- historico: somente administrador.
-- --------------------------------------------------------------------------
create policy historico_leitura on public.historico
  for select to authenticated
  using ((select public.sou_admin()));

-- --------------------------------------------------------------------------
-- Funcoes: anon nao executa nada do schema public; authenticated recebe
-- execucao apenas das funcoes liberadas na migration 09.
-- --------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;

-- Nada no schema public para anon. O grant implicito para PUBLIC tambem sai:
-- sem ele, revogar de anon nao teria efeito (o acesso vinha por heranca).
revoke usage on schema public from public, anon;
grant usage on schema public to postgres, authenticated, service_role;
