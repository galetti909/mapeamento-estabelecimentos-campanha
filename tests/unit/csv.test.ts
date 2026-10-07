import { describe, expect, it } from 'vitest';
import { escreverCsv, lerCsv } from '../../scripts/lib/csv.js';
import { converterLinha } from '../../scripts/importar-csv.js';

describe('lerCsv', () => {
  it('le um CSV simples', () => {
    expect(lerCsv('nome,tipo\nFeira,feira\nBar,bar\n')).toEqual([
      { nome: 'Feira', tipo: 'feira' },
      { nome: 'Bar', tipo: 'bar' },
    ]);
  });

  it('aceita campos entre aspas com virgula dentro', () => {
    expect(lerCsv('nome,endereco\n"Feira do Largo","Rua X, 100"\n')).toEqual([
      { nome: 'Feira do Largo', endereco: 'Rua X, 100' },
    ]);
  });

  it('aceita aspas escapadas', () => {
    expect(lerCsv('nome\n"Bar ""do Ze"""\n')).toEqual([{ nome: 'Bar "do Ze"' }]);
  });

  it('aceita ponto e virgula como separador', () => {
    expect(lerCsv('nome;tipo\nFeira;feira\n')).toEqual([{ nome: 'Feira', tipo: 'feira' }]);
  });

  it('aceita CRLF e BOM', () => {
    expect(lerCsv('﻿nome,tipo\r\nFeira,feira\r\n')).toEqual([{ nome: 'Feira', tipo: 'feira' }]);
  });

  it('ignora linha vazia no fim', () => {
    expect(lerCsv('nome\nFeira\n\n')).toEqual([{ nome: 'Feira' }]);
  });

  it('devolve lista vazia para texto vazio', () => {
    expect(lerCsv('')).toEqual([]);
  });
});

describe('escreverCsv', () => {
  it('escreve cabecalho e linhas', () => {
    expect(escreverCsv([{ a: 1, b: 'x' }])).toBe('a,b\n1,x\n');
  });

  it('escapa virgula, aspas e quebra de linha', () => {
    expect(escreverCsv([{ a: 'x,y' }])).toBe('a\n"x,y"\n');
    expect(escreverCsv([{ a: 'diz "oi"' }])).toBe('a\n"diz ""oi"""\n');
    expect(escreverCsv([{ a: 'linha1\nlinha2' }])).toBe('a\n"linha1\nlinha2"\n');
  });

  it('escreve nulo como campo vazio', () => {
    expect(escreverCsv([{ a: null, b: undefined }])).toBe('a,b\n,\n');
  });

  it('serializa objeto em JSON', () => {
    expect(escreverCsv([{ a: { x: 1 } }])).toBe('a\n"{""x"":1}"\n');
  });

  it('ida e volta preserva os valores', () => {
    const originais = [{ nome: 'Bar "do Ze", esquina', obs: 'linha1\nlinha2' }];
    expect(lerCsv(escreverCsv(originais))).toEqual(originais);
  });
});

describe('converterLinha do importar-csv', () => {
  const valida = { nome: 'Feira Livre da Rua X', tipo: 'feira', lat: '-23.55', lng: '-46.63', endereco: 'Rua X, 100', id_externo: 'FEIRA-01' };

  it('converte uma linha valida', () => {
    const { local, erro } = converterLinha(valida, 2);
    expect(erro).toBeNull();
    expect(local).toEqual({
      origem_id: 'FEIRA-01',
      nome: 'Feira Livre da Rua X',
      tipo: 'feira',
      lat: -23.55,
      lng: -46.63,
      endereco: 'Rua X, 100',
    });
  });

  it('aceita virgula decimal', () => {
    const { local } = converterLinha({ ...valida, lat: '-23,55', lng: '-46,63' }, 2);
    expect(local?.lat).toBe(-23.55);
    expect(local?.lng).toBe(-46.63);
  });

  it('recusa tipo que nao existe', () => {
    const { local, erro } = converterLinha({ ...valida, tipo: 'academia' }, 5);
    expect(local).toBeNull();
    expect(erro).toContain('linha 5');
    expect(erro).toContain('academia');
  });

  it('recusa nome curto', () => {
    expect(converterLinha({ ...valida, nome: 'F' }, 3).local).toBeNull();
  });

  it('recusa lat/lng invalidos', () => {
    expect(converterLinha({ ...valida, lat: 'abc' }, 3).local).toBeNull();
    expect(converterLinha({ ...valida, lng: '' }, 3).local).toBeNull();
  });

  it('recusa id_externo ausente', () => {
    expect(converterLinha({ ...valida, id_externo: '' }, 3).local).toBeNull();
  });

  it('corta nome e endereco nos limites do banco', () => {
    const { local } = converterLinha({ ...valida, nome: 'F'.repeat(200), endereco: 'E'.repeat(300) }, 2);
    expect(local?.nome).toHaveLength(80);
    expect(local?.endereco).toHaveLength(160);
  });

  it('endereco vazio vira nulo', () => {
    expect(converterLinha({ ...valida, endereco: '' }, 2).local?.endereco).toBeNull();
  });
});

describe('converterLinha: coordenadas fora de faixa', () => {
  const valida = { nome: 'Feira Livre da Rua X', tipo: 'feira', lat: '-23.55', lng: '-46.63', endereco: '', id_externo: 'F1' };

  it('recusa latitude fora de -90..90', () => {
    expect(converterLinha({ ...valida, lat: '120' }, 2).local).toBeNull();
  });

  it('recusa longitude fora de -180..180', () => {
    expect(converterLinha({ ...valida, lng: '-200' }, 2).local).toBeNull();
  });

  it('nao confunde campo vazio com a coordenada zero', () => {
    expect(converterLinha({ ...valida, lat: '' }, 2).local).toBeNull();
    expect(converterLinha({ ...valida, lng: '   ' }, 2).local).toBeNull();
  });
});
