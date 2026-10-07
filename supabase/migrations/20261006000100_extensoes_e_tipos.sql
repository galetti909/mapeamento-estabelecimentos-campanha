-- ===========================================================================
-- Mapa de Campanha - 01 - extensoes e tipos enumerados
-- ===========================================================================

create schema if not exists extensions;

create extension if not exists postgis      with schema extensions;
create extension if not exists pgcrypto     with schema extensions;
-- btree_gist permite usar "=" sobre uuid/date dentro da restricao de exclusao
-- que impede agendamentos sobrepostos.
create extension if not exists btree_gist   with schema extensions;

create type public.papel        as enum ('admin', 'voluntario');
create type public.status_conta as enum ('aguardando', 'ativo', 'recusado', 'bloqueado');
create type public.status_local as enum ('importado', 'ativo', 'arquivado');
create type public.origem_local as enum ('osm', 'manual', 'dados_abertos');
create type public.tipo_local   as enum (
  'feira', 'praca', 'parque', 'mercado', 'padaria', 'bar',
  'cafe', 'restaurante', 'comercio', 'terminal', 'outro'
);
create type public.status_pedido as enum ('aberto', 'aprovado', 'recusado');
