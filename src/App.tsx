import { Suspense, lazy, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { CircleCheck, CircleAlert } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Cabecalho, FaixaSomenteLeitura, type Contadores } from '@/components/cabecalho';
import { TelaAcesso } from '@/components/tela-acesso';
import { avisarErro } from '@/lib/avisos';
import { mensagemDeErro } from '@/lib/erros';
import { irPara, lerRota, useHash } from '@/lib/rota';
import { assinarSessao, carregarSessao, estado, sair, souAdmin, versaoSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import { TelaAguardando } from '@/telas/aguardando';
import { TelaEntrar } from '@/telas/entrar';
import { TelaMapa } from '@/telas/mapa';
import { TelaMeusAgendamentos } from '@/telas/meus-agendamentos';
import { TelaRegras } from '@/telas/regras';
import { TelaTrocarSenha } from '@/telas/trocar-senha';

// A área do administrador só é baixada por quem entra nela.
const TelaAdmin = lazy(() => import('@/telas/admin').then((m) => ({ default: m.TelaAdmin })));

const SEM_CONTADORES: Contadores = { contas_aguardando: 0, pedidos_abertos: 0 };

function useSessao(): number {
  return useSyncExternalStore(assinarSessao, versaoSessao);
}

export function App() {
  useSessao();
  const hash = useHash();
  const rota = lerRota(hash);

  const [iniciado, setIniciado] = useState(false);
  const [erroInicio, setErroInicio] = useState<string | null>(null);
  const [inscricaoEnviada, setInscricaoEnviada] = useState(false);
  const [contadores, setContadores] = useState<Contadores>(SEM_CONTADORES);

  const carregarContadores = useCallback(async () => {
    if (!souAdmin()) {
      setContadores(SEM_CONTADORES);
      return;
    }
    const { data, error } = await supabase.rpc('admin_contadores');
    if (error) return;
    setContadores(((data as Contadores[]) ?? [])[0] ?? SEM_CONTADORES);
  }, []);

  const recarregar = useCallback(async () => {
    await carregarSessao();
    void carregarContadores();
  }, [carregarContadores]);

  const encerrar = useCallback(async () => {
    setInscricaoEnviada(false);
    await sair();
    irPara('#/mapa');
  }, []);

  useEffect(() => {
    let ativo = true;
    carregarSessao()
      .then(() => {
        if (!ativo) return;
        setIniciado(true);
        void carregarContadores();
      })
      .catch((erro: unknown) => {
        if (!ativo) return;
        setErroInicio(mensagemDeErro(erro));
        avisarErro(mensagemDeErro(erro));
      });

    const { data } = supabase.auth.onAuthStateChange((evento) => {
      // A inscricao tambem dispara SIGNED_OUT (a sessao recem-aberta e
      // encerrada de proposito). Recarregar ali apagaria a confirmacao, por
      // isso so vale quando havia uma sessao de verdade.
      if (evento === 'SIGNED_OUT' && estado.usuarioId) void recarregar();
    });

    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, [carregarContadores, recarregar]);

  // Administrador entrando numa rota de admin sem ser admin volta ao mapa.
  const precisaSairDoAdmin = iniciado && rota.nome === 'admin' && estado.usuarioId && !souAdmin();
  useEffect(() => {
    if (precisaSairDoAdmin) irPara('#/mapa');
  }, [precisaSairDoAdmin]);

  return (
    <>
      <Conteudo
        iniciado={iniciado}
        erroInicio={erroInicio}
        inscricaoEnviada={inscricaoEnviada}
        setInscricaoEnviada={setInscricaoEnviada}
        contadores={contadores}
        aoAtualizarContadores={() => void carregarContadores()}
        recarregar={() => void recarregar()}
        encerrar={() => void encerrar()}
        hash={hash}
      />
      <Toaster position="top-center" closeButton offset={{ top: 64 }} mobileOffset={{ top: 64 }} />
    </>
  );
}

interface PropsConteudo {
  iniciado: boolean;
  erroInicio: string | null;
  inscricaoEnviada: boolean;
  setInscricaoEnviada: (valor: boolean) => void;
  contadores: Contadores;
  aoAtualizarContadores: () => void;
  recarregar: () => void;
  encerrar: () => void;
  hash: string;
}

function Conteudo(props: PropsConteudo) {
  const rota = lerRota(props.hash);

  if (props.erroInicio) {
    return (
      <Principal>
        <div className="mx-auto w-full max-w-xl p-4 sm:p-6">
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Não foi possível iniciar o app</AlertTitle>
            <AlertDescription>{props.erroInicio}</AlertDescription>
          </Alert>
        </div>
      </Principal>
    );
  }

  if (!props.iniciado) {
    return (
      <Principal>
        <div className="mx-auto grid w-full max-w-xl gap-3 p-6" aria-busy="true" aria-label="Carregando">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </Principal>
    );
  }

  // Sem login: so a tela de entrada (ou a confirmacao da inscricao).
  if (!estado.usuarioId) {
    return (
      <Principal>
        {props.inscricaoEnviada ? (
          <TelaAcesso
            icone={<CircleCheck />}
            titulo="Inscrição enviada"
            descricao="Sua conta está aguardando liberação. Um administrador vai analisar o pedido. Se quiser, fale com alguém do grupo por fora do app: o sistema não envia e-mails."
          >
            <Button className="h-11 w-full" onClick={() => props.setInscricaoEnviada(false)}>
              Voltar para o início
            </Button>
          </TelaAcesso>
        ) : (
          <TelaEntrar aoEntrar={props.recarregar} aoInscrever={() => props.setInscricaoEnviada(true)} />
        )}
      </Principal>
    );
  }

  // Conta nao liberada: nenhuma outra tela fica acessivel.
  const status = estado.perfil?.status ?? 'aguardando';
  if (status !== 'ativo') {
    return (
      <Principal>
        <TelaAguardando status={status} email={estado.email} aoSair={props.encerrar} />
      </Principal>
    );
  }

  const trocaObrigatoria = Boolean(estado.perfil?.trocar_senha) && rota.nome !== 'trocar-senha';

  return (
    <div className="flex h-dvh flex-col">
      <Cabecalho rota={rota} contadores={props.contadores} aoSair={props.encerrar} />
      <FaixaSomenteLeitura ligado={estado.config?.somente_leitura ?? false} />
      <main id="conteudo" tabIndex={-1} className="relative isolate min-h-0 flex-1 overflow-y-auto outline-none">
        {trocaObrigatoria ? (
          <TelaTrocarSenha obrigatoria aoConcluir={props.recarregar} />
        ) : (
          <Tela rota={rota} {...props} />
        )}
      </main>
    </div>
  );
}

function Tela({ rota, ...props }: PropsConteudo & { rota: ReturnType<typeof lerRota> }) {
  switch (rota.nome) {
    case 'meus-agendamentos':
      return <TelaMeusAgendamentos aoAbrirLocal={(id) => irPara(`#/mapa/${id}`)} />;
    case 'regras':
      return <TelaRegras />;
    case 'trocar-senha':
      return <TelaTrocarSenha obrigatoria={estado.perfil?.trocar_senha ?? false} aoConcluir={props.recarregar} />;
    case 'admin':
      if (!souAdmin()) return null;
      return (
        <Suspense fallback={<CarregandoTela />}>
          <TelaAdmin key={rota.secao} secao={rota.secao} aoAtualizarContadores={props.aoAtualizarContadores} />
        </Suspense>
      );
    default:
      // A chave faz a ficha pedida pela rota abrir de novo ao trocar de local.
      return <TelaMapa key={rota.localId ?? 'mapa'} localIdInicial={rota.localId} />;
  }
}

function CarregandoTela() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3 px-4 py-8 sm:px-6" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-7 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-3 h-[76px] w-full rounded-xl" />
      <Skeleton className="h-[76px] w-full rounded-xl" />
    </div>
  );
}

/** Área principal das telas sem cabeçalho (entrada, espera, erro). */
function Principal({ children }: { children: React.ReactNode }) {
  return (
    <main id="conteudo" tabIndex={-1} className="min-h-dvh outline-none">
      {children}
    </main>
  );
}
