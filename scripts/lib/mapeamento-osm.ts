// Mapeamento de tags do OpenStreetMap para tipo_local, exatamente como na
// tabela "Mapeamento de tags para tipo_local" da especificacao.

export const TIPOS_LOCAL = [
  'feira', 'praca', 'parque', 'mercado', 'padaria', 'bar',
  'cafe', 'restaurante', 'comercio', 'terminal', 'outro',
] as const;

export type TipoLocal = (typeof TIPOS_LOCAL)[number];

export type Tags = Record<string, string>;

/** Pares tag=valor com tipo definido, na ordem de precedencia. */
const REGRAS: Array<{ chave: string; valor: string; tipo: TipoLocal }> = [
  { chave: 'amenity', valor: 'marketplace', tipo: 'feira' },
  { chave: 'place', valor: 'square', tipo: 'praca' },
  { chave: 'leisure', valor: 'square', tipo: 'praca' },
  { chave: 'leisure', valor: 'park', tipo: 'parque' },
  { chave: 'shop', valor: 'supermarket', tipo: 'mercado' },
  { chave: 'shop', valor: 'convenience', tipo: 'mercado' },
  { chave: 'shop', valor: 'bakery', tipo: 'padaria' },
  { chave: 'amenity', valor: 'bar', tipo: 'bar' },
  { chave: 'amenity', valor: 'pub', tipo: 'bar' },
  { chave: 'amenity', valor: 'cafe', tipo: 'cafe' },
  { chave: 'amenity', valor: 'restaurant', tipo: 'restaurante' },
  { chave: 'amenity', valor: 'fast_food', tipo: 'restaurante' },
  { chave: 'amenity', valor: 'bus_station', tipo: 'terminal' },
  { chave: 'public_transport', valor: 'station', tipo: 'terminal' },
  { chave: 'railway', valor: 'station', tipo: 'terminal' },
];

/** Tipos para os quais um elemento sem nome ainda e importado. */
export const TIPOS_SEM_NOME: TipoLocal[] = ['praca', 'feira'];

/** Chaves do OSM guardadas em locais.osm_tags: so as usadas no mapeamento. */
export const CHAVES_GUARDADAS = [
  'amenity', 'place', 'leisure', 'shop', 'public_transport', 'railway', 'name',
] as const;

export function tipoDeTags(tags: Tags | undefined): TipoLocal | null {
  if (!tags) return null;

  for (const regra of REGRAS) {
    if (tags[regra.chave] === regra.valor) return regra.tipo;
  }

  // Demais shop=* viram comercio.
  if (tags.shop) return 'comercio';

  return null;
}

/** Guarda somente as tags usadas no mapeamento (nada de dado de pessoa). */
export function tagsGuardadas(tags: Tags | undefined): Tags {
  const guardadas: Tags = {};
  if (!tags) return guardadas;
  for (const chave of CHAVES_GUARDADAS) {
    const valor = tags[chave];
    if (valor !== undefined) guardadas[chave] = valor;
  }
  return guardadas;
}

export interface ElementoOverpass {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Tags;
}

export interface LocalImportado {
  origem_id: string;
  nome: string;
  tipo: TipoLocal;
  lat: number;
  lng: number;
  osm_tags: Tags;
}

export type MotivoIgnorado = 'sem_tipo' | 'sem_nome' | 'sem_posicao' | 'nome_invalido';

export interface Conversao {
  local: LocalImportado | null;
  motivo: MotivoIgnorado | null;
}

/** Nome padrao para pracas e feiras sem nome no OSM. */
const NOME_PADRAO: Record<string, string> = { praca: 'Praça sem nome', feira: 'Feira sem nome' };

export function converterElemento(elemento: ElementoOverpass): Conversao {
  const tipo = tipoDeTags(elemento.tags);
  if (!tipo) return { local: null, motivo: 'sem_tipo' };

  const lat = elemento.lat ?? elemento.center?.lat;
  const lng = elemento.lon ?? elemento.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { local: null, motivo: 'sem_posicao' };
  }

  const nomeBruto = (elemento.tags?.name ?? '').trim();

  // Ignora elementos sem nome, exceto pracas e feiras.
  if (nomeBruto === '' && !TIPOS_SEM_NOME.includes(tipo)) {
    return { local: null, motivo: 'sem_nome' };
  }

  const nome = (nomeBruto === '' ? NOME_PADRAO[tipo] : nomeBruto).slice(0, 80);
  if ([...nome].length < 2) return { local: null, motivo: 'nome_invalido' };

  return {
    local: {
      origem_id: `${elemento.type}/${elemento.id}`,
      nome,
      tipo,
      lat,
      lng,
      osm_tags: tagsGuardadas(elemento.tags),
    },
    motivo: null,
  };
}

/** Monta a consulta Overpass de um municipio pelo codigo IBGE. */
export function consultaOverpass(codigoIbge: number, timeoutSegundos = 90): string {
  const filtros = [
    '["amenity"="marketplace"]',
    '["place"="square"]',
    '["leisure"="square"]',
    '["leisure"="park"]',
    '["shop"]',
    '["amenity"="bar"]',
    '["amenity"="pub"]',
    '["amenity"="cafe"]',
    '["amenity"="restaurant"]',
    '["amenity"="fast_food"]',
    '["amenity"="bus_station"]',
    '["public_transport"="station"]',
    '["railway"="station"]',
  ];

  const corpo = filtros
    .map((f) => `  node${f}(area.a);\n  way${f}(area.a);`)
    .join('\n');

  return [
    `[out:json][timeout:${timeoutSegundos}];`,
    `area["IBGE:GEOCODIGO"="${codigoIbge}"]->.a;`,
    '(',
    corpo,
    ');',
    'out center tags;',
  ].join('\n');
}

/** Alternativa quando o geocodigo nao resolve: nome do municipio e UF. */
export function consultaOverpassPorNome(
  nomeMunicipio: string,
  uf: string,
  timeoutSegundos = 90,
): string {
  const nome = nomeMunicipio.replace(/["\\]/g, '');
  return consultaOverpass(0, timeoutSegundos).replace(
    /^area\["IBGE:GEOCODIGO"="0"\]->\.a;$/m,
    [
      `area["name"="${uf}"]["admin_level"="4"]->.uf;`,
      `area["name"="${nome}"]["admin_level"="8"](area.uf)->.a;`,
    ].join('\n'),
  );
}
