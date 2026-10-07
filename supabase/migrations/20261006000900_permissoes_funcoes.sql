-- ===========================================================================
-- Mapa de Campanha - 09 - permissao de execucao das funcoes
-- Nada do schema public e executavel por anon. authenticated executa apenas
-- as funcoes listadas aqui; as auxiliares (conta_ativa, checar_limite,
-- exigir_admin, registrar_historico, ...) ficam sem grant nenhum, porque sao
-- chamadas de dentro das funcoes SECURITY DEFINER e dos triggers.
-- ===========================================================================

revoke all on all functions in schema public from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- Escrita
-- --------------------------------------------------------------------------
grant execute on function public.marcar_local(text, public.tipo_local, double precision, double precision, text, text, text) to authenticated;
grant execute on function public.ativar_importado(uuid)                              to authenticated;
grant execute on function public.editar_local(uuid, text, public.tipo_local, text, text, text) to authenticated;
grant execute on function public.arquivar_local(uuid, text)                          to authenticated;
grant execute on function public.restaurar_local(uuid, bigint)                       to authenticated;
grant execute on function public.agendar(uuid, date, time, time)                     to authenticated;
grant execute on function public.cancelar_agendamento(uuid)                          to authenticated;
grant execute on function public.pedir_liberacao_limite()                            to authenticated;
grant execute on function public.admin_decidir_pedido(uuid, boolean)                 to authenticated;
grant execute on function public.admin_definir_limite(uuid, boolean)                 to authenticated;
grant execute on function public.admin_definir_status(uuid, public.status_conta)      to authenticated;
grant execute on function public.admin_definir_papel(uuid, public.papel)              to authenticated;
grant execute on function public.admin_arquivar_locais_da_conta(uuid, text)           to authenticated;
grant execute on function public.admin_somente_leitura(boolean)                       to authenticated;
grant execute on function public.trocar_minha_senha_concluida()                       to authenticated;

-- --------------------------------------------------------------------------
-- Leitura
-- --------------------------------------------------------------------------
grant execute on function public.agenda_do_local(uuid)                                to authenticated;
grant execute on function public.meus_agendamentos()                                  to authenticated;
grant execute on function public.meu_limite()                                         to authenticated;
grant execute on function public.local_detalhe(uuid)                                  to authenticated;
grant execute on function public.locais_na_area(double precision, double precision, double precision, double precision, integer, public.status_local[], public.tipo_local[], char, integer, text, boolean, integer) to authenticated;
grant execute on function public.municipios_da_uf(char)                               to authenticated;
grant execute on function public.buscar_municipios(text, integer)                     to authenticated;
grant execute on function public.pode_alterar_local(uuid)                             to authenticated;
grant execute on function public.admin_listar_contas(public.status_conta, text, integer, integer) to authenticated;
grant execute on function public.admin_contadores()                                   to authenticated;
grant execute on function public.admin_listar_pedidos(public.status_pedido)           to authenticated;
grant execute on function public.admin_historico(text, text, text, uuid, timestamptz, timestamptz, integer, integer) to authenticated;

-- --------------------------------------------------------------------------
-- locais_na_area e as demais funcoes SECURITY INVOKER chamam
-- locais_com_agenda_proxima() e pode_alterar_local(); por isso elas precisam
-- de execucao para authenticated.
-- --------------------------------------------------------------------------
grant execute on function public.locais_com_agenda_proxima(integer)                   to authenticated;
grant execute on function public.hoje_brasilia()                                      to authenticated;
grant execute on function public.conta_ativa()                                        to authenticated;
grant execute on function public.sou_admin()                                          to authenticated;
grant execute on function public.contem_dado_pessoal(text)                            to authenticated;

-- Nenhuma funcao do schema public para anon, em nenhuma hipotese.
revoke all on all functions in schema public from anon;

-- --------------------------------------------------------------------------
-- Funcoes dos scripts do administrador: somente a chave de servico.
-- Nenhum grant para anon ou authenticated (o revoke acima ja cuidou disso).
-- --------------------------------------------------------------------------
grant execute on function public.carregar_municipios(jsonb, double precision)        to service_role;
grant execute on function public.importar_locais(public.origem_local, text, text, jsonb) to service_role;
grant execute on function public.criar_admin_inicial(uuid, text)                     to service_role;
grant execute on function public.exportar_agendamentos()                             to service_role;
grant execute on function public.exportar_contas()                                   to service_role;
grant execute on function public.exportar_locais()                                   to service_role;
