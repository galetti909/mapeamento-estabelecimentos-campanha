import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  consultaOverpass,
  consultaOverpassPorNome,
  converterElemento,
  tagsGuardadas,
  tipoDeTags,
  type ElementoOverpass,
} from '../../scripts/lib/mapeamento-osm.js';

const FIXTURE = 'tests/fixtures/overpass-3550308.json';

describe('tipoDeTags: a tabela de mapeamento da especificacao', () => {
  const casos: Array<[Record<string, string>, string]> = [
    [{ amenity: 'marketplace' }, 'feira'],
    [{ place: 'square' }, 'praca'],
    [{ leisure: 'square' }, 'praca'],
    [{ leisure: 'park' }, 'parque'],
    [{ shop: 'supermarket' }, 'mercado'],
    [{ shop: 'convenience' }, 'mercado'],
    [{ shop: 'bakery' }, 'padaria'],
    [{ amenity: 'bar' }, 'bar'],
    [{ amenity: 'pub' }, 'bar'],
    [{ amenity: 'cafe' }, 'cafe'],
    [{ amenity: 'restaurant' }, 'restaurante'],
    [{ amenity: 'fast_food' }, 'restaurante'],
    [{ amenity: 'bus_station' }, 'terminal'],
    [{ public_transport: 'station' }, 'terminal'],
    [{ railway: 'station' }, 'terminal'],
  ];

  for (const [tags, esperado] of casos) {
    it(`${JSON.stringify(tags)} vira ${esperado}`, () => {
      expect(tipoDeTags(tags)).toBe(esperado);
    });
  }

  it('demais shop=* viram comercio', () => {
    expect(tipoDeTags({ shop: 'hardware' })).toBe('comercio');
    expect(tipoDeTags({ shop: 'clothes' })).toBe('comercio');
    expect(tipoDeTags({ shop: 'yes' })).toBe('comercio');
  });

  it('tag sem mapeamento nao gera tipo', () => {
    expect(tipoDeTags({ amenity: 'school' })).toBeNull();
    expect(tipoDeTags({ highway: 'residential' })).toBeNull();
    expect(tipoDeTags({})).toBeNull();
    expect(tipoDeTags(undefined)).toBeNull();
  });
});

describe('tagsGuardadas', () => {
  it('guarda so as chaves usadas no mapeamento', () => {
    expect(tagsGuardadas({
      amenity: 'bar',
      name: 'Bar do Ze',
      phone: '+55 11 91234-5678',
      'contact:email': 'bar@exemplo.org',
      operator: 'Jose da Silva',
      opening_hours: 'Mo-Fr 18:00-23:00',
    })).toEqual({ amenity: 'bar', name: 'Bar do Ze' });
  });

  it('nunca guarda telefone, e-mail nem operador (dado de pessoa)', () => {
    const guardadas = tagsGuardadas({ shop: 'bakery', phone: '1191234567', email: 'a@b.com', operator: 'Maria' });
    expect(Object.keys(guardadas)).toEqual(['shop']);
  });
});

describe('converterElemento', () => {
  it('converte um node com nome', () => {
    const { local } = converterElemento({
      type: 'node', id: 123, lat: -23.5, lon: -46.6,
      tags: { amenity: 'marketplace', name: 'Feira da Praca' },
    });
    expect(local).toEqual({
      origem_id: 'node/123',
      nome: 'Feira da Praca',
      tipo: 'feira',
      lat: -23.5,
      lng: -46.6,
      osm_tags: { amenity: 'marketplace', name: 'Feira da Praca' },
    });
  });

  it('usa o center de um way (out center)', () => {
    const { local } = converterElemento({
      type: 'way', id: 7, center: { lat: -22.9, lon: -43.2 },
      tags: { leisure: 'park', name: 'Parque Novo' },
    });
    expect(local?.origem_id).toBe('way/7');
    expect(local?.lat).toBe(-22.9);
    expect(local?.lng).toBe(-43.2);
  });

  it('ignora elemento sem nome', () => {
    const { local, motivo } = converterElemento({
      type: 'node', id: 1, lat: -23.5, lon: -46.6, tags: { amenity: 'cafe' },
    });
    expect(local).toBeNull();
    expect(motivo).toBe('sem_nome');
  });

  it('aceita praca sem nome', () => {
    const { local } = converterElemento({
      type: 'way', id: 2, center: { lat: -23.5, lon: -46.6 }, tags: { place: 'square' },
    });
    expect(local?.tipo).toBe('praca');
    expect(local?.nome).toBe('Praça sem nome');
  });

  it('aceita feira sem nome', () => {
    const { local } = converterElemento({
      type: 'node', id: 3, lat: -23.5, lon: -46.6, tags: { amenity: 'marketplace' },
    });
    expect(local?.tipo).toBe('feira');
    expect(local?.nome).toBe('Feira sem nome');
  });

  it('ignora elemento sem tipo mapeado', () => {
    const { local, motivo } = converterElemento({
      type: 'node', id: 4, lat: -23.5, lon: -46.6, tags: { amenity: 'school', name: 'Escola' },
    });
    expect(local).toBeNull();
    expect(motivo).toBe('sem_tipo');
  });

  it('ignora elemento sem posicao', () => {
    const { local, motivo } = converterElemento({
      type: 'relation', id: 5, tags: { amenity: 'marketplace', name: 'Feira' },
    });
    expect(local).toBeNull();
    expect(motivo).toBe('sem_posicao');
  });

  it('corta nome com mais de 80 caracteres (limite do banco)', () => {
    const { local } = converterElemento({
      type: 'node', id: 6, lat: -23.5, lon: -46.6,
      tags: { amenity: 'marketplace', name: 'F'.repeat(200) },
    });
    expect(local?.nome).toHaveLength(80);
  });
});

describe('fixture gravada do Overpass', () => {
  const bruto = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { elements: ElementoOverpass[] };

  it('converte todos os elementos com tipo e nome', () => {
    const convertidos = bruto.elements.map(converterElemento);
    const locais = convertidos.filter((c) => c.local !== null);
    expect(locais.length).toBeGreaterThan(10);
  });

  it('nenhum elemento sem nome, fora de praca e feira, entra', () => {
    for (const elemento of bruto.elements) {
      const { local } = converterElemento(elemento);
      if (!local) continue;
      const temNome = Boolean(elemento.tags?.name?.trim());
      if (!temNome) expect(['praca', 'feira']).toContain(local.tipo);
    }
  });

  it('os origem_id sao unicos (nao geram duplicata no upsert)', () => {
    const ids = bruto.elements
      .map((e) => converterElemento(e).local?.origem_id)
      .filter((id): id is string => Boolean(id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cobre todos os tipos do mapeamento', () => {
    const tipos = new Set(
      bruto.elements.map((e) => converterElemento(e).local?.tipo).filter(Boolean),
    );
    for (const tipo of ['feira', 'praca', 'parque', 'mercado', 'padaria', 'bar', 'cafe', 'restaurante', 'comercio', 'terminal']) {
      expect(tipos).toContain(tipo);
    }
  });
});

describe('consultas Overpass', () => {
  it('usa a tag IBGE:GEOCODIGO e out center tags', () => {
    const consulta = consultaOverpass(3550308);
    expect(consulta).toContain('area["IBGE:GEOCODIGO"="3550308"]->.a;');
    expect(consulta).toContain('out center tags;');
    expect(consulta).toContain('[out:json][timeout:90];');
  });

  it('inclui todos os filtros do mapeamento', () => {
    const consulta = consultaOverpass(3550308);
    for (const filtro of ['amenity"="marketplace', 'place"="square', 'leisure"="park', '["shop"]', 'railway"="station']) {
      expect(consulta).toContain(filtro);
    }
  });

  it('a alternativa por nome usa o municipio e a UF', () => {
    const consulta = consultaOverpassPorNome('Campinas', 'SP');
    expect(consulta).toContain('area["name"="SP"]["admin_level"="4"]->.uf;');
    expect(consulta).toContain('area["name"="Campinas"]["admin_level"="8"](area.uf)->.a;');
    expect(consulta).not.toContain('IBGE:GEOCODIGO');
  });

  it('respeita o timeout pedido', () => {
    expect(consultaOverpass(1, 30)).toContain('[out:json][timeout:30];');
  });
});
