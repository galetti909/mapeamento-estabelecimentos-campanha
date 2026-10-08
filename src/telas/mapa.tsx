import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type L from 'leaflet';
import { Layers, ListFilter, LocateFixed, MapPin, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Campo } from '@/components/campo';
import { Painel } from '@/components/painel';
import { avisar, avisarErro, avisarSucesso } from '@/lib/avisos';
import { mensagemDeErro } from '@/lib/erros';
import { ICONE_DO_TIPO } from '@/lib/icones';
import { BRASIL, LEAFLET, criarMapa, guardarArea, lerAreaGuardada } from '@/lib/mapa-base';
import { ROTULO_TIPO, UFS } from '@/lib/rotulos';
import { podeEscrever, souAdmin } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import {
  TIPOS_LOCAL, type Marcador, type MarcadorContagem, type MeuLimite, type Municipio, type StatusLocal, type TipoLocal,
} from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { iconeDoGrupo, iconeDoPonto, type Situacao } from '@/mapa/marcadores';
import { FichaLocal } from './ficha-local';
import { FormularioLocal } from './formulario-local';
import '@/estilos/mapa.css';

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

const FILTROS_INICIAIS: Filtros = {
  uf: '',
  municipio: null,
  tipos: [],
  busca: '',
  comAgendamento: false,
  importados: false,
};

type PainelAberto = { tipo: 'ficha'; localId: string } | { tipo: 'novo'; lat: number; lng: number } | null;

/** Marcador de local com a situação guardada, para os agrupamentos contarem. */
interface MarcadorComSituacao extends L.Marker {
  situacao?: Situacao;
}

function criarGrupo(importado: boolean): L.MarkerClusterGroup {
  return LEAFLET.markerClusterGroup({
    chunkedLoading: true,
    // Raio menor que o padrão (80): de longe aparecem mais pontos separados
    // e os grupos ficam onde há concentração de verdade.
    maxClusterRadius: (zoom: number) => (zoom >= 14 ? 36 : 48),
    disableClusteringAtZoom: 17,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    spiderLegPolylineOptions: { weight: 1.5, opacity: 0.6 },
    iconCreateFunction: (grupo) => {
      const filhos = grupo.getAllChildMarkers() as MarcadorComSituacao[];
      const visitados = filhos.filter((m) => m.situacao === 'visitado').length;
      return iconeDoGrupo(filhos.length, visitados, importado);
    },
  });
}

export function TelaMapa({ localIdInicial }: { localIdInicial?: string }) {
  const destino = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const grupos = useRef<{ ativos: L.MarkerClusterGroup; importados: L.MarkerClusterGroup; contagens: L.LayerGroup } | null>(null);
  const filtrosRef = useRef<Filtros>(FILTROS_INICIAIS);
  const proximaCarga = useRef<number | null>(null);
  const carregando = useRef(false);
  const modoMarcarRef = useRef(false);

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [limite, setLimite] = useState<MeuLimite | null>(null);
  const [modoMarcar, setModoMarcar] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [painel, setPainel] = useState<PainelAberto>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [localizando, setLocalizando] = useState(false);
  const [busca, setBusca] = useState('');
  const [resumo, setResumo] = useState<{ total: number; visitados: number } | null>(null);

  const escrever = podeEscrever();

  // ------------------------------------------------------------ carga de dados
  const desenharMarcadores = useCallback((marcadores: Marcador[]) => {
    const g = grupos.current;
    const m = mapa.current;
    if (!g || !m) return;

    g.ativos.clearLayers();
    g.importados.clearLayers();
    g.contagens.clearLayers();

    const ativos: L.Marker[] = [];
    const importados: L.Marker[] = [];
    let total = 0;
    let visitados = 0;

    for (const marcador of marcadores) {
      if (marcador.modo === 'contagem') {
        g.contagens.addLayer(marcadorDeContagem(marcador, m));
        total += marcador.quantidade;
        visitados += marcador.visitados ?? 0;
        continue;
      }

      const situacao: Situacao = marcador.status === 'importado'
        ? 'importado'
        : marcador.visitado ? 'visitado' : 'pendente';

      const ponto = LEAFLET.marker([marcador.lat, marcador.lng], {
        // O nome vai como atributo de texto: nunca vira HTML.
        title: marcador.nome,
        alt: marcador.nome,
        keyboard: true,
        riseOnHover: true,
        icon: iconeDoPonto(situacao),
      }) as MarcadorComSituacao;
      ponto.situacao = situacao;
      ponto.on('click', () => setPainel({ tipo: 'ficha', localId: marcador.id }));

      if (situacao === 'importado') {
        importados.push(ponto);
      } else {
        ativos.push(ponto);
        total += 1;
        if (situacao === 'visitado') visitados += 1;
      }
    }

    g.ativos.addLayers(ativos);
    g.importados.addLayers(importados);
    setResumo({ total, visitados });

    if (marcadores.length >= LIMITE_POR_CHAMADA) {
      avisar('Muitos locais nesta área. Aproxime o mapa ou use os filtros para ver todos.');
    }
  }, []);

  const carregar = useCallback(async (): Promise<void> => {
    const m = mapa.current;
    if (!m) return;
    if (carregando.current) {
      agendarCarga();
      return;
    }
    carregando.current = true;

    try {
      const f = filtrosRef.current;
      const caixa = m.getBounds();
      const status: StatusLocal[] = f.importados ? ['ativo', 'importado'] : ['ativo'];

      const { data, error } = await supabase.rpc('locais_na_area', {
        p_oeste: caixa.getWest(),
        p_sul: caixa.getSouth(),
        p_leste: caixa.getEast(),
        p_norte: caixa.getNorth(),
        p_zoom: m.getZoom(),
        p_status: status,
        p_tipos: f.tipos.length > 0 ? f.tipos : null,
        p_uf: f.uf || null,
        p_municipio: f.municipio,
        p_busca: f.busca || null,
        p_com_agendamento: f.comAgendamento,
        p_limite: LIMITE_POR_CHAMADA,
      });
      if (error) throw error;
      desenharMarcadores((data as Marcador[]) ?? []);
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
    } finally {
      carregando.current = false;
    }
  }, [desenharMarcadores]);

  function agendarCarga(imediata = false): void {
    if (proximaCarga.current !== null) window.clearTimeout(proximaCarga.current);
    // O atraso junta arrastos e zooms seguidos numa consulta só. Na primeira
    // carga ele seria puro tempo perdido em rede móvel.
    proximaCarga.current = window.setTimeout(() => void carregar(), imediata ? 0 : 250);
  }

  const carregarLimite = useCallback(async () => {
    const { data, error } = await supabase.rpc('meu_limite');
    if (error) return;
    setLimite(((data as MeuLimite[]) ?? [])[0] ?? null);
  }, []);

  // ------------------------------------------------------------- montagem
  useEffect(() => {
    if (!destino.current) return;
    const m = criarMapa(destino.current);
    mapa.current = m;

    const guardada = lerAreaGuardada();
    if (guardada) m.setView([guardada.lat, guardada.lng], guardada.zoom);
    else m.fitBounds(BRASIL);

    const g = { ativos: criarGrupo(false), importados: criarGrupo(true), contagens: LEAFLET.layerGroup() };
    grupos.current = g;
    g.ativos.addTo(m);
    g.contagens.addTo(m);

    m.on('moveend zoomend', () => {
      const centro = m.getCenter();
      guardarArea({ lat: centro.lat, lng: centro.lng, zoom: m.getZoom() });
      agendarCarga();
    });

    m.on('click', (evento: L.LeafletMouseEvent) => {
      if (!modoMarcarRef.current) return;
      modoMarcarRef.current = false;
      setModoMarcar(false);
      setPainel({ tipo: 'novo', lat: evento.latlng.lat, lng: evento.latlng.lng });
    });

    // O tamanho do mapa muda com a faixa de somente leitura e com o painel.
    const observador = new ResizeObserver(() => m.invalidateSize({ pan: false }));
    observador.observe(destino.current);

    void carregarLimite();
    agendarCarga(true);

    if (localIdInicial) void abrirLocalPedido(localIdInicial);

    return () => {
      observador.disconnect();
      if (proximaCarga.current !== null) window.clearTimeout(proximaCarga.current);
      m.remove();
      mapa.current = null;
      grupos.current = null;
    };
    // Monta o mapa uma vez só; a rota com outro local remonta a tela inteira.
  }, []);

  /**
   * Centraliza o mapa num local e abre a ficha dele. Usado pela rota
   * #/mapa/<id>, de onde vem o botão "Ver no mapa" de Meus agendamentos.
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
    mapa.current?.setView([local.lat, local.lng], 17);
    setPainel({ tipo: 'ficha', localId });
  }

  // ---------------------------------------------------------------- filtros
  function aplicar(mudanca: Partial<Filtros>): void {
    const novos = { ...filtrosRef.current, ...mudanca };
    filtrosRef.current = novos;
    setFiltros(novos);
    agendarCarga();
  }

  async function mudarUf(uf: string): Promise<void> {
    aplicar({ uf, municipio: null });
    setMunicipios([]);
    if (!uf) return;
    const { data } = await supabase.rpc('municipios_da_uf', { p_uf: uf });
    setMunicipios((data as Municipio[]) ?? []);
  }

  function alternarTipo(tipo: TipoLocal, marcado: boolean): void {
    const atuais = new Set(filtrosRef.current.tipos);
    if (marcado) atuais.add(tipo);
    else atuais.delete(tipo);
    aplicar({ tipos: TIPOS_LOCAL.filter((t) => atuais.has(t)) });
  }

  function limparFiltros(): void {
    setMunicipios([]);
    aplicar({ uf: '', municipio: null, tipos: [], comAgendamento: false });
  }

  function alternarImportados(): void {
    const ligar = !filtrosRef.current.importados;
    const m = mapa.current;
    const g = grupos.current;
    if (m && g) {
      if (ligar) g.importados.addTo(m);
      else m.removeLayer(g.importados);
    }
    aplicar({ importados: ligar });
  }

  // Busca: espera a pessoa parar de digitar. Com 3 letras ou mais, procura
  // um município e leva o mapa até ele.
  useEffect(() => {
    const termo = busca.trim();
    if (termo === filtrosRef.current.busca) return;
    const espera = window.setTimeout(async () => {
      filtrosRef.current = { ...filtrosRef.current, busca: termo };
      setFiltros(filtrosRef.current);
      if (termo.length >= 3) {
        const { data } = await supabase.rpc('buscar_municipios', { p_busca: termo, p_limite: 1 });
        const achado = ((data as Array<{ lat: number; lng: number }>) ?? [])[0];
        if (achado) mapa.current?.setView([achado.lat, achado.lng], 11);
      }
      agendarCarga();
    }, 400);
    return () => window.clearTimeout(espera);
  }, [busca]);

  // ------------------------------------------------------------------ modos
  function alternarModoMarcar(): void {
    if (!podeEscrever()) {
      avisarErro('O mapa está somente para leitura neste momento.');
      return;
    }
    const ligar = !modoMarcarRef.current;
    modoMarcarRef.current = ligar;
    setModoMarcar(ligar);
    if (ligar) setPainel(null);
  }

  function ondeEstou(): void {
    if (!navigator.geolocation) {
      avisarErro('Este aparelho não informa a localização.');
      return;
    }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        // A localização é usada só aqui, no aparelho; nada vai ao servidor.
        mapa.current?.setView([posicao.coords.latitude, posicao.coords.longitude], 15);
        setLocalizando(false);
      },
      () => {
        avisarErro('Não foi possível obter a sua localização.');
        setLocalizando(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
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

  const fecharPainel = useCallback(() => setPainel(null), []);
  const aoMudar = useCallback(() => {
    void carregarLimite();
    agendarCarga();
  }, [carregarLimite]);

  const filtrosAtivos = (filtros.uf ? 1 : 0) + (filtros.municipio ? 1 : 0) + filtros.tipos.length + (filtros.comAgendamento ? 1 : 0);
  // Administrador não tem limite diário: o contador não faz sentido.
  const mostrarContador = escrever && limite && !souAdmin();

  return (
    <div className={cn('mapa-tela absolute inset-0 isolate overflow-hidden', modoMarcar && 'marcando')}>
      <div ref={destino} id="mapa" aria-label="Mapa do Brasil com os locais marcados" className="absolute inset-0 z-0" />

      {/* ------------------------------------------------ barra superior */}
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 z-[1000] grid gap-2 p-3', painel && 'md:pr-[424px]')}>
        <div className="mapa-barra pointer-events-auto flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2" />
            <input
              type="search"
              id="mapa-busca"
              // O rótulo acessível é descritivo; o texto visível é curto porque
              // numa tela de 360 px ele divide espaço com três botões.
              placeholder="Buscar"
              aria-label="Buscar local ou município"
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={cn(
                'bg-background/95 supports-[backdrop-filter]:bg-background/80 h-11 w-full rounded-xl border pr-3 pl-10 text-base shadow-lg shadow-black/5 backdrop-blur-md md:text-sm',
                'placeholder:text-muted-foreground outline-none transition-[box-shadow,border-color]',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                '[&::-webkit-search-cancel-button]:cursor-pointer',
              )}
            />
          </div>

          <BotaoMapa rotulo="Filtros" dica="Filtros" aria-expanded={filtrosAbertos} ativo={filtrosAbertos || filtrosAtivos > 0}
            onClick={() => setFiltrosAbertos((v) => !v)}>
            <ListFilter />
            {filtrosAtivos > 0 ? (
              <span className="bg-ponto absolute -top-1 -right-1 flex size-[18px] items-center justify-center rounded-full text-[10px] font-semibold text-white tabular-nums ring-2 ring-white">
                {filtrosAtivos}
              </span>
            ) : null}
          </BotaoMapa>
          <BotaoMapa rotulo="Importados" dica="Mostrar locais importados" aria-pressed={filtros.importados}
            ativo={filtros.importados} onClick={alternarImportados}>
            <Layers />
          </BotaoMapa>
          <BotaoMapa rotulo="Onde estou" dica="Onde estou" disabled={localizando} onClick={ondeEstou}>
            <LocateFixed className={cn(localizando && 'animate-pulse')} />
          </BotaoMapa>
        </div>

        {filtrosAbertos ? (
          <PainelFiltros
            filtros={filtros}
            municipios={municipios}
            aoMudarUf={(uf) => void mudarUf(uf)}
            aoMudarMunicipio={(id) => aplicar({ municipio: id })}
            aoAlternarTipo={alternarTipo}
            aoMudarAgendamento={(v) => aplicar({ comAgendamento: v })}
            aoLimpar={limparFiltros}
            aoFechar={() => setFiltrosAbertos(false)}
          />
        ) : (
          <Legenda resumo={resumo} importados={filtros.importados} />
        )}

        {modoMarcar ? (
          <div role="status" className="dica-marcar bg-foreground text-background pointer-events-none mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg animate-in fade-in-0 slide-in-from-top-2">
            <MapPin className="text-ponto size-4" />
            Toque no mapa para posicionar o local.
          </div>
        ) : null}
      </div>

      {/* -------------------------------------------------------- rodapé */}
      {escrever ? (
        <div className={cn(
          'mapa-rodape pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
          painel && 'md:pr-[424px]',
        )}>
          {mostrarContador ? (
            <span className="contador-limite bg-background/95 text-muted-foreground pointer-events-auto rounded-full border px-3 py-1 text-xs font-medium shadow-sm backdrop-blur tabular-nums">
              {limite.sem_limite ? 'Sem limite diário' : `${limite.restantes} de ${limite.limite} marcações hoje`}
            </span>
          ) : null}
          <Button
            aria-pressed={modoMarcar}
            onClick={alternarModoMarcar}
            className={cn(
              'botao-marcar pointer-events-auto h-12 rounded-full px-6 text-[15px] font-semibold shadow-xl transition-all active:scale-[0.97]',
              modoMarcar
                ? 'bg-background text-foreground hover:bg-accent border shadow-black/10'
                : 'bg-ponto hover:bg-ponto-forte shadow-ponto/40 text-white',
            )}
          >
            {modoMarcar ? <X className="size-5" /> : <Plus className="size-5" strokeWidth={2.5} />}
            {modoMarcar ? 'Cancelar' : 'Marcar local'}
          </Button>
        </div>
      ) : null}

      {/* -------------------------------------------------------- painel */}
      {painel?.tipo === 'ficha' ? (
        <FichaLocal
          key={painel.localId}
          localId={painel.localId}
          limite={limite}
          aoFechar={fecharPainel}
          aoMudar={aoMudar}
          aoPedirLimite={() => void pedirLimite()}
        />
      ) : painel?.tipo === 'novo' ? (
        <Painel rotulo="Marcar novo local" rotuloFechar="Fechar formulário" titulo="Marcar local" aoFechar={fecharPainel}
          sobretitulo={<span className="text-ponto-forte text-xs font-semibold tracking-wide uppercase">Novo local</span>}>
          <FormularioLocal
            posicao={{ lat: painel.lat, lng: painel.lng }}
            limite={limite}
            aoSalvar={(id) => {
              aoMudar();
              setPainel({ tipo: 'ficha', localId: id });
            }}
            aoFechar={fecharPainel}
            aoPedirLimite={() => void pedirLimite()}
          />
        </Painel>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function marcadorDeContagem(marcador: MarcadorContagem, m: L.Map): L.Marker {
  const ponto = LEAFLET.marker([marcador.lat, marcador.lng], {
    icon: iconeDoGrupo(marcador.quantidade, marcador.visitados ?? 0),
    title: `${marcador.municipio_nome} (${marcador.uf}): ${marcador.quantidade} locais`,
    alt: `${marcador.municipio_nome}: ${marcador.quantidade} locais`,
    keyboard: true,
    riseOnHover: true,
  });
  ponto.on('click', () => m.setView([marcador.lat, marcador.lng], ZOOM_CONTAGEM + 1));
  return ponto;
}

interface PropsBotaoMapa extends React.ComponentProps<'button'> {
  rotulo: string;
  dica: string;
  ativo?: boolean;
  children: ReactNode;
}

/** Botão redondo da barra do mapa (44 px). A dica é o title nativo. */
function BotaoMapa({ rotulo, dica, ativo, children, className, ...resto }: PropsBotaoMapa) {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={rotulo}
      title={dica}
      className={cn(
        'relative size-11 shrink-0 rounded-xl shadow-lg shadow-black/5 backdrop-blur-md [&_svg:not([class*=size-])]:size-[18px]',
        'bg-background/95 supports-[backdrop-filter]:bg-background/80',
        ativo && 'border-foreground/20 bg-accent text-foreground',
        'aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:border-foreground aria-pressed:hover:bg-foreground/90',
        className,
      )}
      {...resto}
    >
      {children}
    </Button>
  );
}

/** Legenda das cores, com o resumo do que está na tela. */
function Legenda({ resumo, importados }: { resumo: { total: number; visitados: number } | null; importados: boolean }) {
  const pendentes = resumo ? resumo.total - resumo.visitados : null;
  return (
    <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 pointer-events-auto flex w-fit items-center gap-3 rounded-full border py-1.5 pr-3.5 pl-3 text-xs font-medium shadow-md shadow-black/5 backdrop-blur-md">
      <ItemLegenda cor="bg-ponto" rotulo="A visitar" valor={pendentes} />
      <Separator orientation="vertical" className="h-3.5!" />
      <ItemLegenda cor="bg-visitado" rotulo="Visitados" valor={resumo?.visitados ?? null} />
      {importados ? (
        <>
          <Separator orientation="vertical" className="h-3.5!" />
          <ItemLegenda cor="bg-importado" rotulo="Importados" valor={null} />
        </>
      ) : null}
    </div>
  );
}

function ItemLegenda({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: number | null }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn('size-2.5 rounded-full ring-2 ring-white shadow-[0_0_0_1px_rgb(0_0_0/0.12)]', cor)} />
      <span className="text-muted-foreground">{rotulo}</span>
      {valor !== null ? <span className="text-foreground tabular-nums">{valor.toLocaleString('pt-BR')}</span> : null}
    </span>
  );
}

interface PropsFiltros {
  filtros: Filtros;
  municipios: Municipio[];
  aoMudarUf: (uf: string) => void;
  aoMudarMunicipio: (id: number | null) => void;
  aoAlternarTipo: (tipo: TipoLocal, marcado: boolean) => void;
  aoMudarAgendamento: (valor: boolean) => void;
  aoLimpar: () => void;
  aoFechar: () => void;
}

function PainelFiltros(props: PropsFiltros) {
  const { filtros, municipios } = props;

  return (
    <div className="painel-filtros bg-popover text-popover-foreground pointer-events-auto ml-auto grid max-h-[calc(100dvh-10rem)] w-full gap-5 overflow-y-auto rounded-xl border p-4 shadow-xl animate-in fade-in-0 slide-in-from-top-2 sm:w-[360px]">
      <section className="grid gap-3">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Onde</h3>
        <div className="grid grid-cols-[96px_1fr] gap-3">
          <Campo id="filtro-uf" rotulo="UF">
            <NativeSelect id="filtro-uf" value={filtros.uf} onChange={(e) => props.aoMudarUf(e.target.value)}>
              <NativeSelectOption value="">Todas</NativeSelectOption>
              {UFS.map((uf) => <NativeSelectOption key={uf} value={uf}>{uf}</NativeSelectOption>)}
            </NativeSelect>
          </Campo>
          <Campo id="filtro-municipio" rotulo="Município">
            <NativeSelect
              id="filtro-municipio"
              disabled={!filtros.uf || municipios.length === 0}
              value={filtros.municipio ? String(filtros.municipio) : ''}
              onChange={(e) => props.aoMudarMunicipio(e.target.value ? Number(e.target.value) : null)}
            >
              <NativeSelectOption value="">Todos</NativeSelectOption>
              {municipios.map((m) => <NativeSelectOption key={m.id} value={String(m.id)}>{m.nome}</NativeSelectOption>)}
            </NativeSelect>
          </Campo>
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Quando</h3>
        <div className="flex items-center gap-2.5">
          <Checkbox id="filtro-agendamento" checked={filtros.comAgendamento}
            onCheckedChange={(v) => props.aoMudarAgendamento(v === true)} />
          <Label htmlFor="filtro-agendamento" className="font-normal">Com agendamento nos próximos 7 dias</Label>
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Tipo de local</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {TIPOS_LOCAL.map((tipo) => {
            const Icone = ICONE_DO_TIPO[tipo];
            const marcado = filtros.tipos.includes(tipo);
            return (
              <Label
                key={tipo}
                htmlFor={`filtro-tipo-${tipo}`}
                className={cn(
                  'flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 font-normal transition-colors',
                  'hover:bg-accent',
                  marcado && 'border-foreground/25 bg-accent font-medium',
                )}
              >
                <Checkbox id={`filtro-tipo-${tipo}`} checked={marcado}
                  onCheckedChange={(v) => props.aoAlternarTipo(tipo, v === true)} />
                <Icone className="text-muted-foreground size-4" />
                {ROTULO_TIPO[tipo]}
              </Label>
            );
          })}
        </div>
      </section>

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <Button variant="ghost" className="h-10" onClick={props.aoLimpar}>Limpar</Button>
        <Button variant="outline" className="h-10 min-w-24" onClick={props.aoFechar}>Fechar</Button>
      </div>
    </div>
  );
}

