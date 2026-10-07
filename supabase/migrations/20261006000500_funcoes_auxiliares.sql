-- ===========================================================================
-- Mapa de Campanha - 05 - funcoes auxiliares de autorizacao
-- Todas sao SECURITY DEFINER com search_path fixo: leem perfis e config sem
-- depender de politica de leitura, e por isso nao causam recursao no RLS.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- conta_ativa(): verdadeiro se o perfil de auth.uid() estiver 'ativo'.
-- Todas as politicas de leitura usam esta funcao, de modo que bloquear uma
-- conta corta o acesso na chamada seguinte.
-- --------------------------------------------------------------------------
create or replace function public.conta_ativa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p
    where p.id = auth.uid() and p.status = 'ativo'
  );
$$;

-- --------------------------------------------------------------------------
-- sou_admin(): conta ativa com papel 'admin'.
-- --------------------------------------------------------------------------
create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p
    where p.id = auth.uid() and p.status = 'ativo' and p.papel = 'admin'
  );
$$;

-- --------------------------------------------------------------------------
-- exigir_conta_ativa(): erro padronizado para as funcoes de escrita.
-- --------------------------------------------------------------------------
create or replace function public.exigir_conta_ativa()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'sem_login' using hint = 'Entre na sua conta.';
  end if;
  if not public.conta_ativa() then
    raise exception 'conta_nao_ativa'
      using hint = 'Sua conta nao esta liberada por um administrador.';
  end if;
  return v_id;
end;
$$;

-- --------------------------------------------------------------------------
-- exigir_admin()
-- --------------------------------------------------------------------------
create or replace function public.exigir_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
begin
  if not public.sou_admin() then
    raise exception 'somente_admin'
      using hint = 'Acao restrita a administradores.';
  end if;
  return v_id;
end;
$$;

-- --------------------------------------------------------------------------
-- checar_escrita(): erro se o modo somente leitura estiver ligado e quem
-- chama nao for administrador.
-- --------------------------------------------------------------------------
create or replace function public.checar_escrita()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select c.somente_leitura from public.config c where c.id) and not public.sou_admin() then
    raise exception 'somente_leitura'
      using hint = 'O mapa esta temporariamente somente para leitura.';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- hoje_brasilia(): dia corrente no fuso America/Sao_Paulo.
-- --------------------------------------------------------------------------
create or replace function public.hoje_brasilia()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- --------------------------------------------------------------------------
-- locais_marcados_hoje(): quantos locais o perfil criou ou ativou no dia
-- corrente de Brasilia.
-- --------------------------------------------------------------------------
create or replace function public.locais_marcados_hoje(p_perfil uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.locais l
  where l.ativado_por = p_perfil
    and (l.ativado_em at time zone 'America/Sao_Paulo')::date = public.hoje_brasilia();
$$;

-- --------------------------------------------------------------------------
-- checar_limite(): lanca limite_diario_atingido quando o voluntario chega ao
-- limite do dia. Administradores e contas com sem_limite nao tem limite.
-- --------------------------------------------------------------------------
create or replace function public.checar_limite()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id      uuid := auth.uid();
  v_perfil  public.perfis;
  v_limite  integer;
begin
  select * into v_perfil from public.perfis p where p.id = v_id;

  if v_perfil.papel = 'admin' or v_perfil.sem_limite then
    return;
  end if;

  select c.limite_diario into v_limite from public.config c where c.id;

  if public.locais_marcados_hoje(v_id) >= v_limite then
    raise exception 'limite_diario_atingido'
      using hint = format('Voce chegou ao limite de %s locais por hoje.', v_limite);
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- meu_limite(): dados que a tela de marcacao mostra ("restam N marcacoes").
-- --------------------------------------------------------------------------
create or replace function public.meu_limite()
returns table (
  usados        integer,
  limite        integer,
  sem_limite    boolean,
  restantes     integer,
  pedido_aberto boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.locais_marcados_hoje(p.id)                                   as usados,
    c.limite_diario                                                     as limite,
    (p.sem_limite or p.papel = 'admin')                                 as sem_limite,
    case
      when p.sem_limite or p.papel = 'admin' then null::integer
      else greatest(c.limite_diario - public.locais_marcados_hoje(p.id), 0)
    end                                                                 as restantes,
    exists (
      select 1 from public.pedidos_limite pl
      where pl.perfil_id = p.id and pl.status = 'aberto'
    )                                                                   as pedido_aberto
  from public.perfis p
  cross join public.config c
  where p.id = auth.uid() and p.status = 'ativo' and c.id;
$$;
