-- ===========================================================================
-- Mapa de Campanha - 02 - bloqueio de dados pessoais em textos
-- O mesmo conjunto de padroes e repetido em src/lib/validacao.ts para avisar
-- o usuario antes do envio. Qualquer mudanca aqui precisa ser espelhada la.
-- ===========================================================================

create or replace function public.contem_dado_pessoal(texto text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select texto is not null and (
    -- e-mail
       texto ~* '[[:alnum:]._%+-]+@[[:alnum:]][[:alnum:].-]*\.[[:alpha:]]{2,}'
    -- CPF formatado: 000.000.000-00
    or texto ~ '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}'
    -- sequencia isolada de 10 (DDD + 8) ou 11 digitos (DDD + 9 / CPF)
    or texto ~ '\y[0-9]{10,11}\y'
    -- telefone com DDD entre parenteses: (11) 91234-5678
    or texto ~ '\(\s*[0-9]{2}\s*\)\s*9?[0-9]{4}[-. ]?[0-9]{4}'
    -- telefone com hifen: 91234-5678 ou 1234-5678
    or texto ~ '\y9?[0-9]{4}-[0-9]{4}\y'
    -- prefixo internacional do Brasil seguido de telefone
    or texto ~ '\+\s*55\s*\(?\s*[0-9]{2}'
  );
$$;

comment on function public.contem_dado_pessoal(text) is
  'Verdadeiro quando o texto parece conter telefone, CPF ou e-mail. Usada nos CHECK de locais.';
