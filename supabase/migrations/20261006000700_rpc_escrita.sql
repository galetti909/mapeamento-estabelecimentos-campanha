-- ===========================================================================
-- Mapa de Campanha - 07 - funcoes RPC de escrita
-- Toda escrita do app passa por aqui. Cada funcao, nesta ordem:
--   1. confere login e status da conta;
--   2. chama checar_escrita() (modo somente leitura);
--   3. confere papel, autoria e limite diario;
--   4. define app.acao para o trigger de historico;
--   5. escreve.
-- Nenhuma delas apaga linha nenhuma.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- marcar_local
-- --------------------------------------------------------------------------
create or replace function public.marcar_local(
  p_nome           text,
  p_tipo           public.tipo_local,
  p_lat            double precision,
  p_lng            double precision,
  p_endereco       text default null,
  p_melhor_horario text default null,
  p_observacoes    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_id      uuid;
begin
  v_usuario := public.exigir_conta_ativa();
  perform public.checar_escrita();
  perform public.checar_limite();

  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'posicao_invalida' using hint = 'Toque no mapa para posicionar o local.';
  end if;

  perform set_config('app.acao', 'marcar_local', true);

  insert into public.locais (
    nome, tipo, geom, endereco, melhor_horario, observacoes,
    status, origem, criado_por, ativado_por, ativado_em
  )
  values (
    btrim(p_nome),
    p_tipo,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    nullif(btrim(coalesce(p_endereco, '')), ''),
    nullif(btrim(coalesce(p_melhor_horario, '')), ''),
    nullif(btrim(coalesce(p_observacoes, '')), ''),
    'ativo', 'manual', v_usuario, v_usuario, now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- --------------------------------------------------------------------------
-- ativar_importado
-- --------------------------------------------------------------------------
create or replace function public.ativar_importado(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_status  public.status_local;
begin
  v_usuario := public.exigir_conta_ativa();
  perform public.checar_escrita();
  perform public.checar_limite();

  select l.status into v_status from public.locais l where l.id = p_id;

  if v_status is null then
    raise exception 'local_nao_encontrado';
  end if;

  if v_status <> 'importado' then
    raise exception 'local_nao_importado'
      using hint = 'Este local ja foi ativado ou arquivado.';
  end if;

  perform set_config('app.acao', 'ativar_importado', true);

  update public.locais
     set status = 'ativo', ativado_por = v_usuario, ativado_em = now()
   where id = p_id;
end;
$$;

-- --------------------------------------------------------------------------
-- pode_alterar_local: administrador, ou quem marcou ou ativou o local.
-- --------------------------------------------------------------------------
create or replace function public.pode_alterar_local(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.sou_admin() or exists (
    select 1 from public.locais l
    where l.id = p_id
      and (l.criado_por = auth.uid() or l.ativado_por = auth.uid())
  );
$$;

-- --------------------------------------------------------------------------
-- editar_local: nao altera status, origem nem autoria.
-- --------------------------------------------------------------------------
create or replace function public.editar_local(
  p_id             uuid,
  p_nome           text,
  p_tipo           public.tipo_local,
  p_endereco       text default null,
  p_melhor_horario text default null,
  p_observacoes    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_conta_ativa();
  perform public.checar_escrita();

  if not exists (select 1 from public.locais l where l.id = p_id) then
    raise exception 'local_nao_encontrado';
  end if;

  if not public.pode_alterar_local(p_id) then
    raise exception 'sem_permissao'
      using hint = 'Voce so altera os locais que marcou ou ativou.';
  end if;

  perform set_config('app.acao', 'editar_local', true);

  update public.locais
     set nome           = btrim(p_nome),
         tipo           = p_tipo,
         endereco       = nullif(btrim(coalesce(p_endereco, '')), ''),
         melhor_horario = nullif(btrim(coalesce(p_melhor_horario, '')), ''),
         observacoes    = nullif(btrim(coalesce(p_observacoes, '')), '')
   where id = p_id;
end;
$$;

-- --------------------------------------------------------------------------
-- arquivar_local: motivo obrigatorio; cancela os agendamentos futuros.
-- --------------------------------------------------------------------------
create or replace function public.arquivar_local(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_motivo  text := btrim(coalesce(p_motivo, ''));
  v_status  public.status_local;
begin
  v_usuario := public.exigir_conta_ativa();
  perform public.checar_escrita();

  if char_length(v_motivo) < 3 or char_length(v_motivo) > 300 then
    raise exception 'motivo_obrigatorio'
      using hint = 'Escreva o motivo do arquivamento (3 a 300 caracteres).';
  end if;

  select l.status into v_status from public.locais l where l.id = p_id;

  if v_status is null then
    raise exception 'local_nao_encontrado';
  end if;

  if not public.pode_alterar_local(p_id) then
    raise exception 'sem_permissao'
      using hint = 'Voce so arquiva os locais que marcou ou ativou.';
  end if;

  if v_status = 'arquivado' then
    raise exception 'local_ja_arquivado';
  end if;

  perform set_config('app.acao', 'arquivar_local', true);

  update public.locais
     set status              = 'arquivado',
         arquivado_por       = v_usuario,
         arquivado_em        = now(),
         motivo_arquivamento = v_motivo
   where id = p_id;

  update public.agendamentos
     set cancelado_em = now(), cancelado_por = v_usuario
   where local_id = p_id
     and cancelado_em is null
     and dia >= public.hoje_brasilia();
end;
$$;

-- --------------------------------------------------------------------------
-- restaurar_local: volta ao estado gravado na linha indicada do historico.
-- --------------------------------------------------------------------------
create or replace function public.restaurar_local(p_id uuid, p_historico_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_versao jsonb;
begin
  perform public.exigir_admin();
  perform public.checar_escrita();

  select h.depois into v_versao
  from public.historico h
  where h.id = p_historico_id
    and h.tabela = 'locais'
    and h.registro_id = p_id::text
    and h.depois is not null;

  if v_versao is null then
    raise exception 'versao_nao_encontrada'
      using hint = 'Essa linha do historico nao guarda uma versao deste local.';
  end if;

  perform set_config('app.acao', 'restaurar_local', true);

  update public.locais
     set nome                = v_versao ->> 'nome',
         tipo                = (v_versao ->> 'tipo')::public.tipo_local,
         geom                = (v_versao ->> 'geom')::extensions.geography,
         endereco            = v_versao ->> 'endereco',
         melhor_horario      = v_versao ->> 'melhor_horario',
         observacoes         = v_versao ->> 'observacoes',
         status              = (v_versao ->> 'status')::public.status_local,
         ativado_por         = nullif(v_versao ->> 'ativado_por', '')::uuid,
         ativado_em          = nullif(v_versao ->> 'ativado_em', '')::timestamptz,
         arquivado_por       = nullif(v_versao ->> 'arquivado_por', '')::uuid,
         arquivado_em        = nullif(v_versao ->> 'arquivado_em', '')::timestamptz,
         motivo_arquivamento = v_versao ->> 'motivo_arquivamento'
   where id = p_id;
end;
$$;

-- --------------------------------------------------------------------------
-- agendar
-- --------------------------------------------------------------------------
create or replace function public.agendar(
  p_local_id    uuid,
  p_dia         date,
  p_hora_inicio time,
  p_hora_fim    time
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_status  public.status_local;
  v_id      uuid;
begin
  v_usuario := public.exigir_conta_ativa();
  perform public.checar_escrita();

  select l.status into v_status from public.locais l where l.id = p_local_id;

  if v_status is null then
    raise exception 'local_nao_encontrado';
  end if;

  if v_status <> 'ativo' then
    raise exception 'local_nao_ativo'
      using hint = 'So e possivel se agendar em locais ativos.';
  end if;

  if p_dia is null
     or p_dia < public.hoje_brasilia()
     or p_dia > public.hoje_brasilia() + 60 then
    raise exception 'dia_fora_da_janela'
      using hint = 'Escolha um dia de hoje ate 60 dias a frente.';
  end if;

  if p_hora_inicio is null or p_hora_fim is null or p_hora_fim <= p_hora_inicio then
    raise exception 'horario_invalido'
      using hint = 'A hora de fim precisa ser maior que a de inicio.';
  end if;

  perform set_config('app.acao', 'agendar', true);

  begin
    insert into public.agendamentos (local_id, perfil_id, dia, hora_inicio, hora_fim)
    values (p_local_id, v_usuario, p_dia, p_hora_inicio, p_hora_fim)
    returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'agendamento_sobreposto'
        using hint = 'Voce ja tem um agendamento nesse horario neste local.';
  end;

  return v_id;
end;
$$;

-- --------------------------------------------------------------------------
-- cancelar_agendamento: o proprio dono ou um administrador.
-- --------------------------------------------------------------------------
create or replace function public.cancelar_agendamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_ag      public.agendamentos;
begin
  v_usuario := public.exigir_conta_ativa();
  perform public.checar_escrita();

  select * into v_ag from public.agendamentos a where a.id = p_id;

  if v_ag.id is null then
    raise exception 'agendamento_nao_encontrado';
  end if;

  if v_ag.perfil_id <> v_usuario and not public.sou_admin() then
    raise exception 'sem_permissao'
      using hint = 'Voce so cancela o seu proprio agendamento.';
  end if;

  if v_ag.cancelado_em is not null then
    raise exception 'agendamento_ja_cancelado';
  end if;

  perform set_config('app.acao', 'cancelar_agendamento', true);

  update public.agendamentos
     set cancelado_em = now(), cancelado_por = v_usuario
   where id = p_id;
end;
$$;

-- --------------------------------------------------------------------------
-- pedir_liberacao_limite
-- --------------------------------------------------------------------------
create or replace function public.pedir_liberacao_limite()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_perfil  public.perfis;
  v_id      uuid;
begin
  v_usuario := public.exigir_conta_ativa();
  perform public.checar_escrita();

  select * into v_perfil from public.perfis p where p.id = v_usuario;

  if v_perfil.sem_limite or v_perfil.papel = 'admin' then
    raise exception 'sem_limite_ja_liberado'
      using hint = 'Sua conta ja esta sem limite diario.';
  end if;

  if exists (
    select 1 from public.pedidos_limite pl
    where pl.perfil_id = v_usuario and pl.status = 'aberto'
  ) then
    raise exception 'pedido_ja_aberto'
      using hint = 'Voce ja tem um pedido aguardando analise.';
  end if;

  perform set_config('app.acao', 'pedir_liberacao_limite', true);

  insert into public.pedidos_limite (perfil_id)
  values (v_usuario)
  returning id into v_id;

  return v_id;
end;
$$;

-- --------------------------------------------------------------------------
-- admin_decidir_pedido: aprovar liga sem_limite.
-- --------------------------------------------------------------------------
create or replace function public.admin_decidir_pedido(p_id uuid, p_aprovar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  uuid;
  v_pedido public.pedidos_limite;
begin
  v_admin := public.exigir_admin();
  perform public.checar_escrita();

  select * into v_pedido from public.pedidos_limite pl where pl.id = p_id;

  if v_pedido.id is null then
    raise exception 'pedido_nao_encontrado';
  end if;

  if v_pedido.status <> 'aberto' then
    raise exception 'pedido_nao_aberto';
  end if;

  perform set_config('app.acao', 'admin_decidir_pedido', true);

  update public.pedidos_limite
     set status = case when p_aprovar then 'aprovado'::public.status_pedido
                       else 'recusado'::public.status_pedido end,
         decidido_por = v_admin,
         decidido_em  = now()
   where id = p_id;

  if p_aprovar then
    update public.perfis set sem_limite = true where id = v_pedido.perfil_id;
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- admin_definir_limite
-- --------------------------------------------------------------------------
create or replace function public.admin_definir_limite(p_perfil uuid, p_sem_limite boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  perform public.checar_escrita();

  if not exists (select 1 from public.perfis p where p.id = p_perfil) then
    raise exception 'perfil_nao_encontrado';
  end if;

  perform set_config('app.acao', 'admin_definir_limite', true);

  update public.perfis set sem_limite = coalesce(p_sem_limite, false) where id = p_perfil;
end;
$$;

-- --------------------------------------------------------------------------
-- admins_ativos: usada pelas protecoes do papel de administrador.
-- --------------------------------------------------------------------------
create or replace function public.admins_ativos()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.perfis p
  where p.papel = 'admin' and p.status = 'ativo';
$$;

-- --------------------------------------------------------------------------
-- admin_definir_status: nao age sobre si mesmo nem sobre o ultimo
-- administrador ativo.
-- --------------------------------------------------------------------------
create or replace function public.admin_definir_status(p_perfil uuid, p_status public.status_conta)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  uuid;
  v_perfil public.perfis;
begin
  v_admin := public.exigir_admin();
  perform public.checar_escrita();

  if p_perfil = v_admin then
    raise exception 'nao_pode_agir_sobre_si'
      using hint = 'Um administrador nao altera o proprio status.';
  end if;

  select * into v_perfil from public.perfis p where p.id = p_perfil;

  if v_perfil.id is null then
    raise exception 'perfil_nao_encontrado';
  end if;

  if v_perfil.papel = 'admin' and v_perfil.status = 'ativo'
     and p_status <> 'ativo' and public.admins_ativos() <= 1 then
    raise exception 'ultimo_admin'
      using hint = 'Promova outro administrador antes de retirar este.';
  end if;

  perform set_config('app.acao', 'admin_definir_status', true);

  update public.perfis
     set status = p_status, decidido_por = v_admin, decidido_em = now()
   where id = p_perfil;
end;
$$;

-- --------------------------------------------------------------------------
-- admin_definir_papel: mesmas protecoes.
-- --------------------------------------------------------------------------
create or replace function public.admin_definir_papel(p_perfil uuid, p_papel public.papel)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  uuid;
  v_perfil public.perfis;
begin
  v_admin := public.exigir_admin();
  perform public.checar_escrita();

  if p_perfil = v_admin then
    raise exception 'nao_pode_agir_sobre_si'
      using hint = 'Um administrador nao rebaixa a si mesmo.';
  end if;

  select * into v_perfil from public.perfis p where p.id = p_perfil;

  if v_perfil.id is null then
    raise exception 'perfil_nao_encontrado';
  end if;

  if v_perfil.papel = 'admin' and v_perfil.status = 'ativo'
     and p_papel <> 'admin' and public.admins_ativos() <= 1 then
    raise exception 'ultimo_admin'
      using hint = 'Promova outro administrador antes de rebaixar este.';
  end if;

  perform set_config('app.acao', 'admin_definir_papel', true);

  update public.perfis set papel = p_papel where id = p_perfil;
end;
$$;

-- --------------------------------------------------------------------------
-- admin_arquivar_locais_da_conta: arquiva todos os locais ativos que a conta
-- marcou ou ativou, e cancela os agendamentos futuros deles.
-- --------------------------------------------------------------------------
create or replace function public.admin_arquivar_locais_da_conta(p_perfil uuid, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_total  integer;
begin
  v_admin := public.exigir_admin();
  perform public.checar_escrita();

  if char_length(v_motivo) < 3 or char_length(v_motivo) > 300 then
    raise exception 'motivo_obrigatorio'
      using hint = 'Escreva o motivo do arquivamento (3 a 300 caracteres).';
  end if;

  if not exists (select 1 from public.perfis p where p.id = p_perfil) then
    raise exception 'perfil_nao_encontrado';
  end if;

  perform set_config('app.acao', 'admin_arquivar_locais_da_conta', true);

  update public.agendamentos a
     set cancelado_em = now(), cancelado_por = v_admin
   where a.cancelado_em is null
     and a.dia >= public.hoje_brasilia()
     and a.local_id in (
       select l.id from public.locais l
       where l.status = 'ativo'
         and (l.ativado_por = p_perfil or l.criado_por = p_perfil)
     );

  with arquivados as (
    update public.locais l
       set status              = 'arquivado',
           arquivado_por       = v_admin,
           arquivado_em        = now(),
           motivo_arquivamento = v_motivo
     where l.status = 'ativo'
       and (l.ativado_por = p_perfil or l.criado_por = p_perfil)
    returning 1
  )
  select count(*)::integer into v_total from arquivados;

  return v_total;
end;
$$;

-- --------------------------------------------------------------------------
-- admin_somente_leitura
-- --------------------------------------------------------------------------
create or replace function public.admin_somente_leitura(p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  -- Como toda funcao de escrita. Para administrador, checar_escrita() sempre
  -- passa, inclusive com o modo ligado: e o que permite desliga-lo de volta.
  perform public.checar_escrita();

  perform set_config('app.acao', 'admin_somente_leitura', true);

  update public.config set somente_leitura = coalesce(p_ligado, false) where id;
end;
$$;

-- --------------------------------------------------------------------------
-- trocar_minha_senha_concluida: desliga trocar_senha depois que o usuario
-- trocou a senha pelo Supabase Auth.
-- --------------------------------------------------------------------------
create or replace function public.trocar_minha_senha_concluida()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  v_usuario := public.exigir_conta_ativa();
  perform public.checar_escrita();

  perform set_config('app.acao', 'trocar_minha_senha_concluida', true);

  update public.perfis set trocar_senha = false where id = v_usuario;
end;
$$;
