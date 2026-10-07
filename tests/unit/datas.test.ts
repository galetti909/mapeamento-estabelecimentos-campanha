import { describe, expect, it } from 'vitest';
import {
  formatarDia,
  formatarDiaCurto,
  formatarHora,
  formatarMomento,
  hojeBrasilia,
  somarDias,
} from '../../src/lib/datas.js';

describe('hojeBrasilia', () => {
  it('usa o fuso America/Sao_Paulo, nao o UTC', () => {
    // 06/10/2026 02:00 UTC ainda e 05/10 em Brasilia (UTC-3).
    expect(hojeBrasilia(new Date('2026-10-06T02:00:00Z'))).toBe('2026-10-05');
  });

  it('vira o dia as 03:00 UTC', () => {
    expect(hojeBrasilia(new Date('2026-10-06T02:59:59Z'))).toBe('2026-10-05');
    expect(hojeBrasilia(new Date('2026-10-06T03:00:00Z'))).toBe('2026-10-06');
  });

  it('devolve o formato AAAA-MM-DD', () => {
    expect(hojeBrasilia(new Date('2026-01-02T15:00:00Z'))).toBe('2026-01-02');
  });
});

describe('somarDias', () => {
  it('soma dentro do mes', () => {
    expect(somarDias('2026-10-06', 1)).toBe('2026-10-07');
  });

  it('atravessa o mes', () => {
    expect(somarDias('2026-10-06', 60)).toBe('2026-12-05');
  });

  it('atravessa o ano', () => {
    expect(somarDias('2026-12-25', 10)).toBe('2027-01-04');
  });

  it('aceita ano bissexto', () => {
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('aceita dias negativos', () => {
    expect(somarDias('2026-10-01', -1)).toBe('2026-09-30');
  });
});

describe('formatacao', () => {
  it('formata dia curto com o dia da semana', () => {
    // 06/10/2026 e uma terca-feira.
    expect(formatarDiaCurto('2026-10-06')).toBe('ter, 06/10');
  });

  it('formata dia completo em pt-BR', () => {
    expect(formatarDia('2026-10-06')).toBe('06/10/2026');
  });

  it('corta os segundos da hora', () => {
    expect(formatarHora('08:30:00')).toBe('08:30');
  });

  it('formata um momento no fuso de Brasilia', () => {
    expect(formatarMomento('2026-10-06T17:32:00Z')).toBe('06/10/2026 às 14:32');
  });

  it('formata um momento que muda de dia no fuso de Brasilia', () => {
    expect(formatarMomento('2026-10-06T02:00:00Z')).toBe('05/10/2026 às 23:00');
  });
});
