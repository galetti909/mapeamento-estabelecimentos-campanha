// Ícones SVG desenhados no próprio bundle. Nenhuma requisição externa, nada
// de fonte de ícone: a CSP só libera o próprio domínio, o Supabase e os tiles.
// Traço de 1,75 px numa grade de 24, para casar com o peso da tipografia.

import type { TipoLocal } from './tipos.js';

const SVG = 'http://www.w3.org/2000/svg';

/** Caminhos de cada ícone (grade 24×24, traço). */
const TRACOS: Record<string, string[]> = {
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  fechar: ['M6 6l12 12', 'M18 6L6 18'],
  mapa: ['M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z', 'M9 4v13', 'M15 7v13'],
  calendario: [
    'M5 6.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1Z',
    'M4 10.5h16', 'M8.5 4v4', 'M15.5 4v4',
  ],
  livro: ['M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5Z', 'M17 7.5h2v12H8'],
  pessoas: [
    'M9 11a3.25 3.25 0 1 0 0-6.5A3.25 3.25 0 0 0 9 11Z',
    'M3 19.5c0-3 2.7-5 6-5s6 2 6 5',
    'M16 5.2a3 3 0 0 1 0 5.6', 'M17.5 14.8c2 .7 3.5 2.3 3.5 4.7',
  ],
  mao: ['M12 3v9', 'M8.5 6.5 12 3l3.5 3.5', 'M4.5 13v4a4 4 0 0 0 4 4h7a4 4 0 0 0 4-4v-4'],
  relogio: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7.5V12l3 2'],
  historico: ['M3.5 12a8.5 8.5 0 1 0 2.6-6.1', 'M3 4v5h5', 'M12 8v4.2l3 1.8'],
  controle: ['M5 8h14', 'M5 16h14', 'M9 5.5v5', 'M15 13.5v5'],
  chave: ['M15.5 3a5.5 5.5 0 1 1-4.9 8L4 17.6V21h3.4l1.3-1.3v-2h2l1.4-1.4v-1.7',
          'M16.8 7.8h.01'],
  sair: ['M15 8V5.5a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h7a1.5 1.5 0 0 0 1.5-1.5V16',
         'M10 12h11', 'M18 9l3 3-3 3'],
  busca: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'M16.2 16.2 21 21'],
  filtro: ['M4 6h16', 'M7 12h10', 'M10 18h4'],
  camadas: ['M12 3.5 3 8l9 4.5L21 8l-9-4.5Z', 'M3 13l9 4.5L21 13', 'M3 17.5 12 22l9-4.5'],
  alvo: ['M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
         'M12 2v2.5', 'M12 19.5V22', 'M2 12h2.5', 'M19.5 12H22'],
  mais: ['M12 5v14', 'M5 12h14'],
  lapis: ['M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z', 'M14.5 6.5l3 3'],
  caixa: ['M4 8.5h16V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8.5Z',
          'M3.5 5h17a.5.5 0 0 1 .5.5v3H3v-3a.5.5 0 0 1 .5-.5Z', 'M10 12.5h4'],
  check: ['M5 12.5 10 17.5 19 7'],
  xis: ['M6 6l12 12', 'M18 6L6 18'],
  alerta: ['M12 4.5 2.8 20h18.4L12 4.5Z', 'M12 10v4.5', 'M12 17.2h.01'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5.5', 'M12 7.8h.01'],
  cadeado: ['M6 10.5h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z',
            'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5'],
  olho: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z',
         'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  baixar: ['M12 4v11', 'M8 11.5l4 4 4-4', 'M4.5 19.5h15'],
  seta: ['M5 12h14', 'M13 6l6 6-6 6'],
  local: ['M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
};

export type NomeIcone = keyof typeof TRACOS;

export interface OpcoesIcone {
  tamanho?: number;
  traco?: number;
  classe?: string;
}

/** Cria um <svg> do conjunto. Decorativo por padrão (aria-hidden). */
export function icone(nome: NomeIcone, opcoes: OpcoesIcone = {}): SVGSVGElement {
  const tamanho = opcoes.tamanho ?? 20;
  const svg = document.createElementNS(SVG, 'svg');

  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(tamanho));
  svg.setAttribute('height', String(tamanho));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(opcoes.traco ?? 1.75));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (opcoes.classe) svg.setAttribute('class', opcoes.classe);

  for (const d of TRACOS[nome] ?? []) {
    const caminho = document.createElementNS(SVG, 'path');
    caminho.setAttribute('d', d);
    svg.append(caminho);
  }

  return svg;
}

/** Ícone de cada tipo de local, usado na ficha e nas etiquetas. */
export const ICONE_DO_TIPO: Record<TipoLocal, NomeIcone> = {
  feira: 'caixa',
  praca: 'mapa',
  parque: 'mapa',
  mercado: 'caixa',
  padaria: 'caixa',
  bar: 'pessoas',
  cafe: 'pessoas',
  restaurante: 'pessoas',
  comercio: 'caixa',
  terminal: 'seta',
  outro: 'local',
};

/* ------------------------------------------------------------------------
   Pinos do mapa.
   Um SVG por tipo, desenhado como data-URI: o Leaflet precisa de uma URL de
   imagem, e assim o pino continua vindo do próprio bundle.
   ------------------------------------------------------------------------ */

/** Glifo interno de cada tipo, já no sistema de coordenadas do pino. */
const GLIFOS: Record<TipoLocal, string> = {
  feira:       '<path d="M9 11h8M9 14.5h8" />',
  praca:       '<path d="M13 9.5v8M9.5 12.5h7" />',
  parque:      '<path d="M13 17.5v-3M9.8 13.2 13 8.8l3.2 4.4z" />',
  mercado:     '<path d="M9.5 10.5h7l-.8 7h-5.4z" /><path d="M11.3 10.5a1.7 1.7 0 0 1 3.4 0" />',
  padaria:     '<path d="M9.5 13.8c0-2.2 1.6-3.8 3.5-3.8s3.5 1.6 3.5 3.8-1.6 3.4-3.5 3.4-3.5-1.2-3.5-3.4z" />',
  bar:         '<path d="M9.5 10h7l-3.5 4v3.5" /><path d="M11 17.5h4" />',
  cafe:        '<path d="M9.8 10.5h5.6v3.8a2.8 2.8 0 0 1-5.6 0z" /><path d="M15.4 11.6h1.3a1.2 1.2 0 0 1 0 2.4h-1.3" />',
  restaurante: '<path d="M10.6 9.8v8M15.4 9.8v3a1.5 1.5 0 0 1-3 0v-3" /><path d="M13.9 12.8v5" />',
  comercio:    '<path d="M9.5 12.2h7v5.3h-7z" /><path d="M9.5 12.2 10.6 9.6h4.8l1.1 2.6" />',
  terminal:    '<path d="M9.8 10h6.4v5.2H9.8z" /><path d="M10.6 17.4v-2.2M15.4 17.4v-2.2M9.8 12.6h6.4" />',
  outro:       '<circle cx="13" cy="13" r="2.6" />',
};

const CORES_TIPO: Record<TipoLocal, string> = {
  feira: '#1f6a46',
  praca: '#2f7d53',
  parque: '#2d7a4a',
  mercado: '#1f6a46',
  padaria: '#8a5a2b',
  bar: '#8a4b6b',
  cafe: '#7a5230',
  restaurante: '#9a5433',
  comercio: '#3f6690',
  terminal: '#4b5b7a',
  outro: '#5c5c57',
};

function pinoSvg(tipo: TipoLocal, cor: string, apagado: boolean): string {
  return [
    `<svg xmlns="${SVG}" width="26" height="34" viewBox="0 0 26 34">`,
    apagado ? '<g opacity="0.82">' : '<g>',
    // sombra de contato
    '<ellipse cx="13" cy="31.4" rx="4.6" ry="1.7" fill="rgba(15,20,18,0.22)"/>',
    // corpo do pino
    `<path d="M13 1.6c-5.6 0-10.2 4.5-10.2 10.1 0 7.4 8.6 16.3 9.4 17.1a1.1 1.1 0 0 0 1.6 0c.8-.8 9.4-9.7 9.4-17.1C23.2 6.1 18.6 1.6 13 1.6Z" fill="${cor}"/>`,
    `<path d="M13 1.6c-5.6 0-10.2 4.5-10.2 10.1 0 7.4 8.6 16.3 9.4 17.1a1.1 1.1 0 0 0 1.6 0c.8-.8 9.4-9.7 9.4-17.1C23.2 6.1 18.6 1.6 13 1.6Z" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.6"/>`,
    // glifo
    `<g fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${GLIFOS[tipo]}</g>`,
    '</g></svg>',
  ].join('');
}

const cache = new Map<string, string>();

/** URL (data-URI) do pino de um tipo. */
export function urlDoPino(tipo: TipoLocal, apagado = false): string {
  const chave = `${tipo}:${apagado}`;
  const guardado = cache.get(chave);
  if (guardado) return guardado;

  const svg = pinoSvg(tipo, apagado ? '#8a8a83' : CORES_TIPO[tipo], apagado);
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  cache.set(chave, url);
  return url;
}

export const TAMANHO_PINO: [number, number] = [26, 34];
export const ANCORA_PINO: [number, number] = [13, 31];
