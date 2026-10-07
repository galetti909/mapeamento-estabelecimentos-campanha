import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

/**
 * Provedor de tiles (o fundo do mapa: ruas, rios, nomes de bairros).
 *
 * A especificacao previa o CARTO Voyager sem chave e mandava conferir os
 * termos antes de publicar. Conferido em 06/10/2026: o CARTO passou a exigir
 * chave de API nos tiles raster — sem chave, cada tile volta com a marca
 * "API KEY REQUIRED" (confirmado baixando um tile de Sao Paulo). O plano
 * gratuito tambem ficou limitado a 1 milhao de tiles por mes para uso
 * comercial e 5 milhoes para nao comercial.
 *
 * Por isso o padrao passou a ser a camada padrao do OpenStreetMap, que nao
 * exige chave nenhuma e pede apenas o credito visivel. A politica de uso do
 * OSMF (operations.osmfoundation.org/policies/tiles) permite um aplicativo
 * comunitario deste porte desde que: o credito fique visivel, o navegador
 * respeite o cache, nao haja download em massa nem pre-carga de areas, e o
 * acesso seja por HTTPS. O app cumpre as quatro condicoes: so busca os tiles
 * da area que a pessoa esta vendo e nao tem modo offline.
 *
 * Trocar de provedor e trocar as quatro constantes abaixo e o dominio em
 * connect-src/img-src da CSP (ver vite.config.ts). Se o dono do projeto
 * preferir o CARTO, basta uma chave de API: a URL vira
 * https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=...
 */
export const TILES_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILES_CREDITO =
  '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>';
export const TILES_MAX_ZOOM = 19;

/** Enquadramento do Brasil inteiro. */
export const BRASIL: L.LatLngBoundsExpression = [
  [-33.9, -74.0],
  [5.3, -34.0],
];

export const LEAFLET = L;

export function criarMapa(destino: HTMLElement): L.Map {
  const mapa = L.map(destino, {
    // O prefixo "Leaflet" nos créditos é opcional e só acrescenta ruído; o
    // crédito obrigatório é o do OpenStreetMap, declarado na camada abaixo.
    attributionControl: true,
    // O controle de zoom e adicionado a mao no canto inferior esquerdo: no
    // canto superior direito ele cobriria os botoes da barra do app numa tela
    // de 360 a 390 px.
    zoomControl: false,
    minZoom: 3,
    maxZoom: TILES_MAX_ZOOM,
    worldCopyJump: false,
  });

  mapa.attributionControl.setPrefix(false);
  L.control.zoom({ position: 'bottomleft' }).addTo(mapa);

  L.tileLayer(TILES_URL, {
    attribution: TILES_CREDITO,
    maxZoom: TILES_MAX_ZOOM,
    // detectRetina desligado de proposito: ele buscaria quatro tiles por
    // quadro em telas de alta densidade, o que seria carga desnecessaria nos
    // servidores do OpenStreetMap e no 4G de quem usa o app.
    detectRetina: false,
  }).addTo(mapa);

  return mapa;
}

const CHAVE_AREA = 'mapa-de-campanha-area';

export interface AreaGuardada {
  lat: number;
  lng: number;
  zoom: number;
}

/** Ultima area vista, guardada no aparelho (nada vai para o servidor). */
export function lerAreaGuardada(): AreaGuardada | null {
  try {
    const bruto = localStorage.getItem(CHAVE_AREA);
    if (!bruto) return null;
    const area = JSON.parse(bruto) as AreaGuardada;
    if (typeof area.lat !== 'number' || typeof area.lng !== 'number' || typeof area.zoom !== 'number') {
      return null;
    }
    return area;
  } catch {
    return null;
  }
}

export function guardarArea(area: AreaGuardada): void {
  try {
    localStorage.setItem(CHAVE_AREA, JSON.stringify(area));
  } catch {
    // Sem localStorage (navegacao privada, por exemplo) o app segue funcionando.
  }
}
