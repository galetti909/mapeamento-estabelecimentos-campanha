-- ===========================================================================
-- Mapa de Campanha - seed do ambiente local
--
-- Carrega uma AMOSTRA da malha municipal do IBGE: dez municipios, cada um
-- aproximado por um retangulo, com o nome e a UF reais do IBGE. E o
-- suficiente para os testes de pgTAP, Vitest e Playwright. A malha nacional
-- real (5.570 municipios) e carregada em producao por
-- scripts/carregar-municipios.ts.
--
-- Este arquivo roda apenas em 'supabase db reset' (ambiente local); nunca vai
-- para producao com 'supabase db push'.
-- ===========================================================================

insert into public.municipios (id, nome, uf, geom) values
  (3550308, 'São Paulo', 'SP', extensions.st_geomfromtext('MULTIPOLYGON(((-46.826 -24.008, -46.365 -24.008, -46.365 -23.357, -46.826 -23.357, -46.826 -24.008)))', 4326)),
  (3509502, 'Campinas', 'SP', extensions.st_geomfromtext('MULTIPOLYGON(((-47.2 -23.06, -46.87 -23.06, -46.87 -22.73, -47.2 -22.73, -47.2 -23.06)))', 4326)),
  (3304557, 'Rio de Janeiro', 'RJ', extensions.st_geomfromtext('MULTIPOLYGON(((-43.8 -23.08, -43.1 -23.08, -43.1 -22.74, -43.8 -22.74, -43.8 -23.08)))', 4326)),
  (3106200, 'Belo Horizonte', 'MG', extensions.st_geomfromtext('MULTIPOLYGON(((-44.06 -20.06, -43.86 -20.06, -43.86 -19.77, -44.06 -19.77, -44.06 -20.06)))', 4326)),
  (4314902, 'Porto Alegre', 'RS', extensions.st_geomfromtext('MULTIPOLYGON(((-51.32 -30.27, -51 -30.27, -51 -29.93, -51.32 -29.93, -51.32 -30.27)))', 4326)),
  (1302603, 'Manaus', 'AM', extensions.st_geomfromtext('MULTIPOLYGON(((-60.3 -3.3, -59.6 -3.3, -59.6 -2.55, -60.3 -2.55, -60.3 -3.3)))', 4326)),
  (2927408, 'Salvador', 'BA', extensions.st_geomfromtext('MULTIPOLYGON(((-38.56 -13.02, -38.3 -13.02, -38.3 -12.73, -38.56 -12.73, -38.56 -13.02)))', 4326)),
  (2611606, 'Recife', 'PE', extensions.st_geomfromtext('MULTIPOLYGON(((-35.02 -8.15, -34.86 -8.15, -34.86 -7.93, -35.02 -7.93, -35.02 -8.15)))', 4326)),
  (4106902, 'Curitiba', 'PR', extensions.st_geomfromtext('MULTIPOLYGON(((-49.39 -25.65, -49.18 -25.65, -49.18 -25.34, -49.39 -25.34, -49.39 -25.65)))', 4326)),
  (5300108, 'Brasília', 'DF', extensions.st_geomfromtext('MULTIPOLYGON(((-48.29 -16.05, -47.31 -16.05, -47.31 -15.5, -48.29 -15.5, -48.29 -16.05)))', 4326))
on conflict (id) do update
  set nome = excluded.nome, uf = excluded.uf, geom = excluded.geom;
