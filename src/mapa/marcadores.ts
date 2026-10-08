// Marcadores do mapa.
//
// Cada local é um ponto redondo: vermelho enquanto ninguém esteve lá, verde
// depois de um agendamento encerrado, cinza quando é só um importado. O HTML
// dos ícones é fixo e montado aqui (nenhum dado do usuário entra nele); o
// nome do local vai pelo atributo title do Leaflet, que é texto.
//
// Os agrupamentos mostram quantos pontos há embaixo e, no anel, a fração já
// visitada em verde: de longe dá para ver onde há concentração de locais e
// quanto dela já foi coberto.

import { LEAFLET } from '@/lib/mapa-base';
import type L from 'leaflet';

export type Situacao = 'pendente' | 'visitado' | 'importado';

const TAMANHO_PONTO = 22;

const cacheIcones = new Map<Situacao, L.DivIcon>();

/** Ícone de um local. Um por situação, reaproveitado por todos os pontos. */
export function iconeDoPonto(situacao: Situacao): L.DivIcon {
  const guardado = cacheIcones.get(situacao);
  if (guardado) return guardado;

  const icone = LEAFLET.divIcon({
    className: `ponto ponto-${situacao}`,
    // Halo (anima nos pendentes), corpo com brilho e o miolo branco.
    html: '<span class="ponto-halo"></span><span class="ponto-corpo"></span>',
    iconSize: [TAMANHO_PONTO, TAMANHO_PONTO],
    iconAnchor: [TAMANHO_PONTO / 2, TAMANHO_PONTO / 2],
  });
  cacheIcones.set(situacao, icone);
  return icone;
}

/** Diâmetro do agrupamento: cresce com a quantidade, sem passar de 72 px. */
function tamanhoDoGrupo(quantidade: number): number {
  return Math.round(Math.min(72, 34 + Math.log10(Math.max(quantidade, 1)) * 14));
}

/** "1,2 mil" a partir de 1.200: o número cabe no círculo. */
export function quantidadeCurta(quantidade: number): string {
  if (quantidade < 1000) return String(quantidade);
  const mil = quantidade / 1000;
  return `${mil >= 10 ? Math.round(mil) : mil.toFixed(1).replace('.', ',').replace(',0', '')} mil`;
}

/**
 * Ícone de um agrupamento de pontos.
 * @param quantidade total de locais no grupo
 * @param visitados quantos deles já foram visitados
 * @param importado grupo da camada de importados (cinza)
 */
export function iconeDoGrupo(quantidade: number, visitados: number, importado = false): L.DivIcon {
  const tamanho = tamanhoDoGrupo(quantidade);
  const fracao = quantidade > 0 ? Math.min(1, visitados / quantidade) : 0;
  const graus = Math.round(fracao * 360);
  const todos = fracao >= 1;

  const icone = LEAFLET.divIcon({
    className: `grupo${importado ? ' grupo-importado' : todos ? ' grupo-visitado' : ''}`,
    html:
      // O anel mostra a fração visitada (verde) sobre o resto (vermelho).
      `<span class="grupo-anel" style="--visitado-graus:${graus}deg"></span>`
      + `<span class="grupo-corpo">${quantidadeCurta(quantidade)}</span>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho / 2],
  });
  return icone;
}
