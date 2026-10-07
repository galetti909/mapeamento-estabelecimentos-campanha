import type L from 'leaflet';
import { botao, el, selecao, substituir } from '../lib/dom.js';
import { avisar, avisarErro, avisarSucesso } from '../lib/avisos.js';
import { mensagemDeErro } from '../lib/erros.js';
import { ROTULO_TIPO, UFS } from '../lib/rotulos.js';
import { estado, podeEscrever } from '../lib/sessao.js';
import { supabase } from '../lib/supabase.js';
import { TIPOS_LOCAL, type Marcador, type MeuLimite, type Municipio, type StatusLocal, type TipoLocal } from '../lib/tipos.js';
import { BRASIL, LEAFLET, criarMapa, guardarArea, lerAreaGuardada } from '../lib/mapa-base.js';
import { ANCORA_PINO, TAMANHO_PINO, icone, urlDoPino } from '../lib/icones.js';
import { fichaLocal } from './ficha-local.js';
import { formularioLocal } from './formulario-local.js';

const ZOOM_CONTAGEM = 9;
const LIMITE_POR_CHAMADA = 3000;

interface Filtros {
  uf: string;
  municipio: number | null;
  tipos: TipoLocal[];
  busca: string;
  comAgendamento: boolean;
  importados: boolean;
}

export function telaMapa(localIdInicial?: string): HTMLElement {
  const filtros: Filtros = {
    uf: '',
    municipio: null,
    tipos: [],
    busca: '',
    comAgendamento: false,
    importados: false,
  };

  let limite: MeuLimite | null = null;
  let modoMarcar = false;
  let carregando = false;
  let proximaCarga: number | null = null;

  const destinoMapa = el('div', { id: 'mapa', rotuloAria: 'Mapa do Brasil com os locais marcados' });

  const busca = el('input', {
    tipo: 'search',
    id: 'mapa-busca',
    // O rotulo acessivel continua descritivo; o texto visivel e curto porque
    // numa tela de 360 px ele dividiria espaco com tres botoes.
    placeholder: 'Buscar',
    rotuloAria: 'Buscar local ou município',
    autocomplete: 'off',
  });

  const blocoBusca = el('div', { classe: 'mapa-busca' }, icone('busca', { tamanho: 18 }), busca);

  const botaoFiltros = botao('', alternarFiltros, { classe: 'mapa-botao', rotuloAria: 'Filtros' });
  botaoFiltros.append(icone('filtro'));
  botaoFiltros.setAttribute('aria-expanded', 'false');
  botaoFiltros.title = 'Filtros';

  const botaoImportados = botao('', alternarImportados, { classe: 'mapa-botao', rotuloAria: 'Importados' });
  botaoImportados.append(icone('camadas'));
  botaoImportados.setAttribute('aria-pressed', 'false');
  botaoImportados.title = 'Mostrar locais importados';

  const botaoOndeEstou = botao('', () => void ondeEstou(), { classe: 'mapa-botao', rotuloAria: 'Onde estou' });
  botaoOndeEstou.append(icone('alvo'));
  botaoOndeEstou.title = 'Onde estou';

  const barra = el('div', { classe: 'mapa-barra' }, blocoBusca, botaoFiltros, botaoImportados, botaoOndeEstou);

  const painelFiltros = el('div', { classe: 'painel-filtros', hidden: true });
  const dicaMarcar = el('div', { classe: 'dica-marcar', hidden: true, role: 'status' });

  const contadorLimite = el('span', { classe: 'contador-limite', hidden: true });

  const botaoMarcar = botao('', alternarModoMarcar, { classe: 'botao-marcar' });
  const rotuloMarcar = el('span', { texto: 'Marcar local' });
  botaoMarcar.append(icone('mais'), rotuloMarcar);
  botaoMarcar.setAttribute('aria-pressed', 'false');

  const rodape = el('div', { classe: 'mapa-rodape' }, contadorLimite, botaoMarcar);
  const areaPainel = el('div');

  const tela = el('div', { classe: 'mapa-tela' }, destinoMapa, barra, painelFiltros, dicaMarcar, rodape, areaPainel);

  let mapa: L.Map;
  let grupoAtivos: L.MarkerClusterGroup;
  let grupoImportados: L.MarkerClusterGroup;
  let grupoContagens: L.LayerGroup;

  // O mapa precisa do elemento já no documento para calcular o tamanho.
  queueMicrotask(() => iniciar());

  function iniciar(): void {
    mapa = criarMapa(destinoMapa);

    const guardada = lerAreaGuardada();
    if (guardada) {
      mapa.setView([guardada.lat, guardada.lng], guardada.zoom);
    } else {
      mapa.fitBounds(BRASIL);
    }

    grupoAtivos = LEAFLET.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 60,
      disableClusteringAtZoom: 17,
    });
    grupoImportados = LEAFLET.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 60,
      disableClusteringAtZoom: 17,
    });
    grupoContagens = LEAFLET.layerGroup();

    grupoAtivos.addTo(mapa);
    grupoContagens.addTo(mapa);

    // Sem o controle de camadas do Leaflet: o botao "Importados" da barra do
    // app faz a mesma coisa, e dois controles para a mesma opcao confundem.

    mapa.on('moveend zoomend', () => {
      const centro = mapa.getCenter();
      guardarArea({ lat: centro.lat, lng: centro.lng, zoom: mapa.getZoom() });
      agendarCarga();
    });

    mapa.on('click', (evento: L.LeafletMouseEvent) => {
      if (!modoMarcar) return;
      alternarModoMarcar();
      abrirFormularioNovo(evento.latlng.lat, evento.latlng.lng);
    });

    desenharFiltros();
    void carregarLimite();
    agendarCarga(true);

    if (localIdInicial) void abrirLocalPedido(localIdInicial);
  }

  /**
   * Centraliza o mapa num local e abre a ficha dele. Usado pela rota
   * #/mapa/<id>, de onde vem o botao "Ver no mapa" de Meus agendamentos.
   */
  async function abrirLocalPedido(localId: string): Promise<void> {
    const { data, error } = await supabase.rpc('local_detalhe', { p_id: localId });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    const local = ((data as Array<{ lat: number; lng: number }>) ?? [])[0];
    if (!local) {
      avisarErro('Local não encontrado.');
      return;
    }
    mapa.setView([local.lat, local.lng], 17);
    abrirFicha(localId);
  }

  // ------------------------------------------------------------ carga de dados
  function agendarCarga(imediata = false): void {
    if (proximaCarga !== null) window.clearTimeout(proximaCarga);
    // O atraso existe para juntar arrastos e zooms seguidos numa consulta so.
    // Na primeira carga ele seria puro tempo perdido em rede movel.
    proximaCarga = window.setTimeout(() => void carregar(), imediata ? 0 : 250);
  }

  async function carregar(): Promise<void> {
    if (carregando) {
      agendarCarga();
      return;
    }
    carregando = true;

    try {
      const caixa = mapa.getBounds();
      const zoom = mapa.getZoom();
      const status: StatusLocal[] = filtros.importados ? ['ativo', 'importado'] : ['ativo'];

      const { data, error } = await supabase.rpc('locais_na_area', {
        p_oeste: caixa.getWest(),
        p_sul: caixa.getSouth(),
        p_leste: caixa.getEast(),
        p_norte: caixa.getNorth(),
        p_zoom: zoom,
        p_status: status,
        p_tipos: filtros.tipos.length > 0 ? filtros.tipos : null,
        p_uf: filtros.uf || null,
        p_municipio: filtros.municipio,
        p_busca: filtros.busca || null,
        p_com_agendamento: filtros.comAgendamento,
        p_limite: LIMITE_POR_CHAMADA,
      });

      if (error) throw error;

      desenharMarcadores((data as Marcador[]) ?? []);
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
    } finally {
      carregando = false;
    }
  }

  function desenharMarcadores(marcadores: Marcador[]): void {
    grupoAtivos.clearLayers();
    grupoImportados.clearLayers();
    grupoContagens.clearLayers();

    const ativos: L.Marker[] = [];
    const importados: L.Marker[] = [];

    for (const marcador of marcadores) {
      if (marcador.modo === 'contagem') {
        grupoContagens.addLayer(marcadorDeContagem(marcador));
        continue;
      }

      const importado = marcador.status === 'importado';
      const ponto = LEAFLET.marker([marcador.lat, marcador.lng], {
        title: marcador.nome,
        alt: marcador.nome,
        keyboard: true,
        icon: LEAFLET.icon({
          iconUrl: urlDoPino(marcador.tipo, importado),
          iconSize: TAMANHO_PINO,
          iconAnchor: ANCORA_PINO,
          className: importado ? 'pino importado' : 'pino',
        }),
      });
      ponto.on('click', () => abrirFicha(marcador.id));
      if (importado) importados.push(ponto);
      else ativos.push(ponto);
    }

    grupoAtivos.addLayers(ativos);
    grupoImportados.addLayers(importados);

    if (marcadores.length >= LIMITE_POR_CHAMADA) {
      avisar('Muitos locais nesta área. Aproxime o mapa ou use os filtros para ver todos.');
    }
  }

  function marcadorDeContagem(marcador: Marcador & { modo: 'contagem' }): L.Marker {
    const tamanho = Math.min(64, 30 + String(marcador.quantidade).length * 8);
    const icone = LEAFLET.divIcon({
      className: '',
      html: '',
      iconSize: [tamanho, tamanho],
    });

    const ponto = LEAFLET.marker([marcador.lat, marcador.lng], {
      icon: icone,
      title: `${marcador.municipio_nome} (${marcador.uf}): ${marcador.quantidade} locais`,
      alt: `${marcador.municipio_nome}: ${marcador.quantidade} locais`,
    });

    // O conteudo do marcador e montado com textContent, nunca com innerHTML.
    ponto.on('add', () => {
      const elemento = ponto.getElement();
      if (!elemento) return;
      elemento.classList.add('marcador-contagem');
      elemento.style.width = `${tamanho}px`;
      elemento.style.height = `${tamanho}px`;
      elemento.textContent = String(marcador.quantidade);
    });

    ponto.on('click', () => {
      mapa.setView([marcador.lat, marcador.lng], ZOOM_CONTAGEM + 1);
    });

    return ponto;
  }

  // ----------------------------------------------------------------- limite
  async function carregarLimite(): Promise<void> {
    const { data, error } = await supabase.rpc('meu_limite');
    if (error) return;
    limite = ((data as MeuLimite[]) ?? [])[0] ?? null;
    atualizarContador();
  }

  function atualizarContador(): void {
    if (!limite || !podeEscrever()) {
      contadorLimite.hidden = true;
      botaoMarcar.hidden = !podeEscrever();
      return;
    }
    botaoMarcar.hidden = false;
    contadorLimite.textContent = limite.sem_limite
      ? 'Sem limite diário'
      : `${limite.restantes} de ${limite.limite} marcações hoje`;
    contadorLimite.hidden = false;
  }

  async function pedirLimite(): Promise<void> {
    const { error } = await supabase.rpc('pedir_liberacao_limite');
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso('Pedido enviado. Um administrador vai analisar.');
    await carregarLimite();
  }

  // ------------------------------------------------------------------ painel
  function fecharPainel(): void {
    substituir(areaPainel);
  }

  function abrirFicha(localId: string): void {
    substituir(
      areaPainel,
      fichaLocal({
        localId,
        limite,
        aoFechar: fecharPainel,
        aoMudar: () => {
          void carregarLimite();
          agendarCarga();
        },
        aoPedirLimite: () => void pedirLimite(),
      }),
    );
  }

  function abrirFormularioNovo(lat: number, lng: number): void {
    const fechar = botao('', fecharPainel, { classe: 'botao-icone', rotuloAria: 'Fechar formulário' });
    fechar.append(icone('fechar'));

    const fundo = el('div', { classe: 'folha-fundo' });
    fundo.addEventListener('click', fecharPainel);

    const painel = el(
      'div',
      { classe: 'painel', role: 'dialog', 'aria-label': 'Marcar novo local' },
      el('div', { classe: 'painel-puxador', 'aria-hidden': 'true' }),
      el('div', { classe: 'painel-cabecalho' }, el('h2', { texto: 'Marcar local' }), fechar),
      el('div', { classe: 'painel-corpo' },
        formularioLocal({
          posicao: { lat, lng },
          limite,
          aoSalvar: (id) => {
            void carregarLimite();
            agendarCarga();
            abrirFicha(id);
          },
          aoFechar: fecharPainel,
          aoPedirLimite: () => void pedirLimite(),
        }),
      ),
    );

    substituir(areaPainel, fundo, painel);
  }

  // ------------------------------------------------------------------- modos
  function alternarModoMarcar(): void {
    if (!podeEscrever()) {
      avisarErro('O mapa está somente para leitura neste momento.');
      return;
    }
    modoMarcar = !modoMarcar;
    botaoMarcar.setAttribute('aria-pressed', String(modoMarcar));
    rotuloMarcar.textContent = modoMarcar ? 'Cancelar' : 'Marcar local';
    botaoMarcar.replaceChildren(icone(modoMarcar ? 'xis' : 'mais'), rotuloMarcar);

    dicaMarcar.hidden = !modoMarcar;
    if (modoMarcar) {
      substituir(dicaMarcar, icone('local', { tamanho: 18 }),
        el('span', { texto: 'Toque no mapa para posicionar o local.' }));
      fecharPainel();
    }
  }

  function alternarImportados(): void {
    filtros.importados = !filtros.importados;
    botaoImportados.setAttribute('aria-pressed', String(filtros.importados));
    if (filtros.importados) grupoImportados.addTo(mapa);
    else mapa.removeLayer(grupoImportados);
    agendarCarga();
  }

  function alternarFiltros(): void {
    painelFiltros.hidden = !painelFiltros.hidden;
    botaoFiltros.setAttribute('aria-expanded', String(!painelFiltros.hidden));
  }

  async function ondeEstou(): Promise<void> {
    if (!navigator.geolocation) {
      avisarErro('Este aparelho não informa a localização.');
      return;
    }
    botaoOndeEstou.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        // A localizacao e usada so aqui, no aparelho; nada e enviado ao servidor.
        mapa.setView([posicao.coords.latitude, posicao.coords.longitude], 15);
        botaoOndeEstou.disabled = false;
      },
      () => {
        avisarErro('Não foi possível obter a sua localização.');
        botaoOndeEstou.disabled = false;
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  // ------------------------------------------------------------------ filtros
  function desenharFiltros(): void {
    const uf = selecao({
      id: 'filtro-uf',
      rotulo: 'UF',
      itens: UFS.map((sigla) => ({ valor: sigla, texto: sigla })),
      vazio: 'Todas',
    });

    const municipio = selecao({ id: 'filtro-municipio', rotulo: 'Município', itens: [], vazio: 'Todos' });
    municipio.entrada.disabled = true;

    uf.entrada.addEventListener('change', async () => {
      filtros.uf = uf.entrada.value;
      filtros.municipio = null;
      municipio.entrada.disabled = true;
      substituir(municipio.entrada, el('option', { valor: '', texto: 'Todos' }));

      if (filtros.uf) {
        const { data } = await supabase.rpc('municipios_da_uf', { p_uf: filtros.uf });
        for (const m of (data as Municipio[]) ?? []) {
          municipio.entrada.append(el('option', { valor: String(m.id), texto: m.nome }));
        }
        municipio.entrada.disabled = false;
      }
      agendarCarga();
    });

    municipio.entrada.addEventListener('change', () => {
      filtros.municipio = municipio.entrada.value ? Number(municipio.entrada.value) : null;
      agendarCarga();
    });

    const caixasTipo = TIPOS_LOCAL.map((tipo) => {
      const caixa = el('input', { tipo: 'checkbox', id: `filtro-tipo-${tipo}`, valor: tipo });
      caixa.addEventListener('change', () => {
        filtros.tipos = TIPOS_LOCAL.filter((t) => {
          const entrada = document.getElementById(`filtro-tipo-${t}`) as HTMLInputElement | null;
          return entrada?.checked ?? false;
        });
        agendarCarga();
      });
      return el('div', { classe: 'selecionar-todos' }, caixa, el('label', { for: `filtro-tipo-${tipo}`, texto: ROTULO_TIPO[tipo] }));
    });

    const comAgendamento = el('input', { tipo: 'checkbox', id: 'filtro-agendamento' });
    comAgendamento.addEventListener('change', () => {
      filtros.comAgendamento = comAgendamento.checked;
      agendarCarga();
    });

    substituir(
      painelFiltros,
      el('h3', { texto: 'Onde' }),
      uf.bloco,
      municipio.bloco,
      el('h3', { texto: 'Quando' }),
      el('div', { classe: 'selecionar-todos' }, comAgendamento,
        el('label', { for: 'filtro-agendamento', texto: 'Com agendamento nos próximos 7 dias' })),
      el('h3', { texto: 'Tipo de local' }),
      el('div', { classe: 'grade-tipos' }, ...caixasTipo),
      el('div', { classe: 'acoes acoes-fim' },
        botao('Limpar', limparFiltros, { classe: 'botao-sutil' }),
        botao('Fechar', alternarFiltros, { classe: 'botao-secundario' })),
    );
  }

  /** Volta todos os filtros ao estado inicial. */
  function limparFiltros(): void {
    filtros.uf = '';
    filtros.municipio = null;
    filtros.tipos = [];
    filtros.comAgendamento = false;
    desenharFiltros();
    agendarCarga();
  }

  let buscaTimer: number | null = null;
  busca.addEventListener('input', () => {
    if (buscaTimer !== null) window.clearTimeout(buscaTimer);
    buscaTimer = window.setTimeout(async () => {
      filtros.busca = busca.value.trim();

      // Busca por municipio: centraliza o mapa no primeiro resultado.
      if (filtros.busca.length >= 3) {
        const { data } = await supabase.rpc('buscar_municipios', { p_busca: filtros.busca, p_limite: 1 });
        const achado = ((data as Array<{ lat: number; lng: number }>) ?? [])[0];
        if (achado) mapa.setView([achado.lat, achado.lng], 11);
      }
      agendarCarga();
    }, 400);
  });

  if (!podeEscrever()) {
    botaoMarcar.hidden = true;
  }
  if (estado.perfil?.papel === 'admin') {
    // Administrador nao tem limite diario: o contador nao faz sentido.
    contadorLimite.hidden = true;
  }

  return tela;
}
