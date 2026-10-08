import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ChevronDown, CircleAlert, Download, Ellipsis, Filter, Hand, History, Loader2, Lock, RotateCcw, Search, Unlock, Users,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Campo, CampoTexto } from '@/components/campo';
import { iniciais } from '@/components/cabecalho';
import { CabecalhoPagina, LinhaLista, Lista, Pagina, Vazio } from '@/components/pagina';
import { avisar, avisarErro, avisarSucesso } from '@/lib/avisos';
import { formatarMomento } from '@/lib/datas';
import { mensagemDeErro } from '@/lib/erros';
import { baixarArquivo, escreverCsvCliente } from '@/lib/exportacao';
import type { SecaoAdmin } from '@/lib/rota';
import { ROTULO_ACAO, ROTULO_PAPEL, ROTULO_STATUS_CONTA, ROTULO_TABELA } from '@/lib/rotulos';
import { carregarSessao, estado } from '@/lib/sessao';
import { chamarAdminUsuarios, supabase } from '@/lib/supabase';
import type { ContaAdmin, LinhaHistorico, PedidoAdmin, StatusConta } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { validarMotivoArquivamento, validarSenha } from '@/lib/validacao';

export function TelaAdmin({ secao, aoAtualizarContadores }: { secao: SecaoAdmin; aoAtualizarContadores: () => void }) {
  return (
    <Pagina>
      {secao === 'pedidos' ? <SecaoPedidos aoAtualizarContadores={aoAtualizarContadores} />
        : secao === 'historico' ? <SecaoHistorico />
          : secao === 'controle' ? <SecaoControle />
            : <SecaoContas aoAtualizarContadores={aoAtualizarContadores} />}
    </Pagina>
  );
}

// ---------------------------------------------------------------- comuns
function Carregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: linhas }, (_, i) => <Skeleton key={i} className="h-[76px] w-full rounded-xl" />)}
    </div>
  );
}

function Erro({ mensagem }: { mensagem: string }) {
  return <Alert variant="destructive"><CircleAlert /><AlertDescription>{mensagem}</AlertDescription></Alert>;
}

function Meta({ children }: { children: ReactNode }) {
  // Sem separadores escritos: o espaçamento já separa, e um "·" sobrando no
  // fim de uma linha quebrada parece erro de digitação.
  return <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">{children}</div>;
}

function AvatarConta({ nome }: { nome: string }) {
  return (
    <span aria-hidden="true" className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
      {iniciais(nome)}
    </span>
  );
}

/**
 * Carga com descarte de respostas vencidas: duas cargas podem estar no ar
 * ao mesmo tempo (a inicial e a da busca), e só a mais recente pode desenhar.
 */
function useCargaRecente() {
  const atual = useRef(0);
  return useCallback(() => {
    atual.current += 1;
    const minha = atual.current;
    return () => minha === atual.current;
  }, []);
}

// ===========================================================================
// Contas
// ===========================================================================
const ABAS: Array<{ status: StatusConta; rotulo: string }> = [
  { status: 'aguardando', rotulo: 'Aguardando' },
  { status: 'ativo', rotulo: 'Ativas' },
  { status: 'recusado', rotulo: 'Recusadas' },
  { status: 'bloqueado', rotulo: 'Bloqueadas' },
];

type Dialogo = { tipo: 'senha' | 'arquivar'; conta: ContaAdmin } | null;

function SecaoContas({ aoAtualizarContadores }: { aoAtualizarContadores: () => void }) {
  const [statusAtual, setStatusAtual] = useState<StatusConta>('aguardando');
  const [busca, setBusca] = useState('');
  const [contas, setContas] = useState<ContaAdmin[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const novaCarga = useCargaRecente();

  const carregar = useCallback(async (status: StatusConta, termo: string) => {
    const vigente = novaCarga();
    // A lista atual fica na tela durante a recarga: trocá-la pelo esqueleto
    // piscaria a cada letra da busca e fecharia um menu de ações aberto.
    const { data, error } = await supabase.rpc('admin_listar_contas', { p_status: status, p_busca: termo.trim() || null });
    if (!vigente()) return; // resposta vencida
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setErro(null);
    const lista = (data as ContaAdmin[]) ?? [];
    setContas(lista);
    // Mantém marcadas apenas as contas que continuam na lista.
    setSelecionadas((atuais) => new Set([...atuais].filter((id) => lista.some((c) => c.id === id))));
  }, [novaCarga]);

  const recarregar = () => void carregar(statusAtual, busca);

  useEffect(() => {
    const espera = window.setTimeout(() => void carregar(statusAtual, busca), busca ? 350 : 0);
    return () => window.clearTimeout(espera);
  }, [statusAtual, busca, carregar]);

  async function definirStatus(conta: ContaAdmin, status: StatusConta) {
    const { error } = await supabase.rpc('admin_definir_status', { p_perfil: conta.id, p_status: status });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso(`${conta.nome_exibicao}: ${ROTULO_STATUS_CONTA[status].toLowerCase()}.`);
    aoAtualizarContadores();
    recarregar();
  }

  async function decidirLote(status: StatusConta) {
    if (selecionadas.size === 0) {
      avisar('Selecione pelo menos uma conta.');
      return;
    }
    let ok = 0;
    const erros: string[] = [];
    for (const id of selecionadas) {
      const { error } = await supabase.rpc('admin_definir_status', { p_perfil: id, p_status: status });
      if (error) erros.push(mensagemDeErro(error));
      else ok += 1;
    }
    setSelecionadas(new Set());
    if (ok > 0) avisarSucesso(`${ok} conta(s) atualizada(s).`);
    if (erros.length > 0) avisarErro(`${erros.length} falha(s): ${erros[0]}`);
    aoAtualizarContadores();
    recarregar();
  }

  async function definirPapel(conta: ContaAdmin, papel: 'admin' | 'voluntario') {
    const { error } = await supabase.rpc('admin_definir_papel', { p_perfil: conta.id, p_papel: papel });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso(`${conta.nome_exibicao} agora é ${ROTULO_PAPEL[papel].toLowerCase()}.`);
    recarregar();
  }

  async function definirLimite(conta: ContaAdmin, semLimite: boolean) {
    const { error } = await supabase.rpc('admin_definir_limite', { p_perfil: conta.id, p_sem_limite: semLimite });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso(semLimite ? 'Limite liberado.' : 'Limite restabelecido.');
    recarregar();
  }

  const total = contas?.length ?? 0;
  const n = selecionadas.size;
  const emLote = statusAtual === 'aguardando' && total > 0;
  const todas: boolean | 'indeterminate' = n === 0 ? false : n === total ? true : 'indeterminate';

  return (
    <>
      <CabecalhoPagina titulo="Contas" descricao="Libere quem pediu acesso e cuide das contas ativas." />

      <div className="grid gap-3">
        <Tabs value={statusAtual} onValueChange={(v) => { setStatusAtual(v as StatusConta); setContas(null); setSelecionadas(new Set()); }}>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList className="h-10">
              {ABAS.map((aba) => <TabsTrigger key={aba.status} value={aba.status} className="px-3">{aba.rotulo}</TabsTrigger>)}
            </TabsList>
          </div>
        </Tabs>

        <div className="relative">
          <Label htmlFor="admin-busca" className="sr-only">Buscar</Label>
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2" />
          <Input id="admin-busca" type="search" placeholder="Buscar por nome ou e-mail" aria-label="Buscar conta por nome ou e-mail"
            className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        {emLote ? (
          <div className="bg-muted/50 flex min-h-12 flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
            <div className="flex flex-1 items-center gap-2.5">
              <Checkbox id="admin-todas" checked={todas}
                onCheckedChange={(v) => setSelecionadas(v === true ? new Set((contas ?? []).map((c) => c.id)) : new Set())} />
              <Label htmlFor="admin-todas" className="text-sm font-normal">
                {n > 0 ? `${n} de ${total} selecionadas` : `Selecionar todas (${total})`}
              </Label>
            </div>
            {n > 0 ? (
              <div className="flex gap-2">
                <Button size="sm" className="h-8" onClick={() => void decidirLote('ativo')}>{`Liberar ${n}`}</Button>
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10 h-8"
                  onClick={() => void decidirLote('recusado')}>{`Recusar ${n}`}</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {erro ? <Erro mensagem={erro} /> : contas === null ? <Carregando /> : contas.length === 0 ? (
        <Vazio icone={<Users />} titulo="Nenhuma conta com este status." />
      ) : (
        <Lista>
          {contas.map((conta) => (
            <LinhaConta
              key={conta.id}
              conta={conta}
              selecionavel={statusAtual === 'aguardando'}
              selecionada={selecionadas.has(conta.id)}
              aoSelecionar={(marcada) => setSelecionadas((atuais) => {
                const novas = new Set(atuais);
                if (marcada) novas.add(conta.id);
                else novas.delete(conta.id);
                return novas;
              })}
              aoStatus={(status) => void definirStatus(conta, status)}
              aoPapel={(papel) => void definirPapel(conta, papel)}
              aoLimite={(semLimite) => void definirLimite(conta, semLimite)}
              aoDialogo={(tipo) => setDialogo({ tipo, conta })}
            />
          ))}
        </Lista>
      )}

      <DialogoSenhaTemporaria
        conta={dialogo?.tipo === 'senha' ? dialogo.conta : null}
        aoFechar={() => setDialogo(null)}
        aoConcluir={recarregar}
      />
      <DialogoArquivarLocais
        conta={dialogo?.tipo === 'arquivar' ? dialogo.conta : null}
        aoFechar={() => setDialogo(null)}
        aoConcluir={recarregar}
      />
    </>
  );
}

interface PropsLinhaConta {
  conta: ContaAdmin;
  selecionavel: boolean;
  selecionada: boolean;
  aoSelecionar: (marcada: boolean) => void;
  aoStatus: (status: StatusConta) => void;
  aoPapel: (papel: 'admin' | 'voluntario') => void;
  aoLimite: (semLimite: boolean) => void;
  aoDialogo: (tipo: 'senha' | 'arquivar') => void;
}

const COR_STATUS: Record<StatusConta, string> = {
  aguardando: 'bg-aviso-suave text-foreground border-aviso/30',
  ativo: 'bg-visitado-suave text-visitado-forte border-transparent',
  recusado: 'bg-destructive/10 text-destructive border-transparent',
  bloqueado: 'bg-destructive/10 text-destructive border-transparent',
};

function LinhaConta({ conta, selecionavel, selecionada, aoSelecionar, aoStatus, aoPapel, aoLimite, aoDialogo }: PropsLinhaConta) {
  const eu = conta.id === estado.usuarioId;

  return (
    <LinhaLista className={cn(selecionada && 'bg-muted/40')}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {selecionavel ? (
          <Checkbox className="mt-2.5" checked={selecionada} onCheckedChange={(v) => aoSelecionar(v === true)}
            aria-label={`Selecionar ${conta.nome_exibicao}`} />
        ) : null}
        <AvatarConta nome={conta.nome_exibicao} />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="grid gap-0.5">
            <strong className="truncate text-sm font-semibold">{conta.nome_exibicao + (eu ? ' (você)' : '')}</strong>
            <span className="text-muted-foreground truncate text-[13px]">{conta.email}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={COR_STATUS[conta.status]}>{ROTULO_STATUS_CONTA[conta.status]}</Badge>
            {conta.papel === 'admin' ? <Badge variant="secondary">Administrador</Badge> : null}
            {conta.sem_limite ? <Badge variant="secondary">Sem limite</Badge> : null}
            {conta.trocar_senha ? <Badge variant="secondary">Troca de senha pendente</Badge> : null}
          </div>
          <Meta>
            <span>{`Inscrição em ${formatarMomento(conta.criado_em)}`}</span>
            <span>{`${conta.locais_ativos} locais ativos`}</span>
            <span>{`${conta.marcados_hoje} marcados hoje`}</span>
            {conta.decidido_em ? (
              <span>
                {`Decidida em ${formatarMomento(conta.decidido_em)}`
                  + (conta.decidido_por_nome ? ` por ${conta.decidido_por_nome}` : '')}
              </span>
            ) : null}
          </Meta>
        </div>
      </div>

      {eu ? (
        <p className="text-muted-foreground text-xs sm:max-w-36 sm:text-right">Você não altera a própria conta.</p>
      ) : (
        // Duas ações ficam à vista; as demais vão para o menu, senão a linha
        // transborda a tela do celular.
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          {conta.status !== 'ativo' ? (
            <Button size="sm" className="h-8 flex-1 sm:flex-none" onClick={() => aoStatus('ativo')}>Liberar</Button>
          ) : null}
          {conta.status === 'aguardando' ? (
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10 h-8 flex-1 sm:flex-none"
              onClick={() => aoStatus('recusado')}>Recusar</Button>
          ) : null}
          {conta.status === 'ativo' ? (
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10 h-8 flex-1 sm:flex-none"
              onClick={() => aoStatus('bloqueado')}>Bloquear</Button>
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5" aria-label={`Mais ações para ${conta.nome_exibicao}`}>
                <Ellipsis />
                <ChevronDown className="text-muted-foreground size-3.5!" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {conta.papel === 'voluntario' ? (
                <DropdownMenuItem onSelect={() => aoPapel('admin')}>Promover a admin</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => aoPapel('voluntario')}>Rebaixar a voluntário</DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => aoLimite(!conta.sem_limite)}>
                {conta.sem_limite ? 'Retirar sem limite' : 'Liberar sem limite'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => aoDialogo('senha')}>Senha temporária</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => aoDialogo('arquivar')}>Arquivar locais da conta</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </LinhaLista>
  );
}

function DialogoSenhaTemporaria({ conta, aoFechar, aoConcluir }: { conta: ContaAdmin | null; aoFechar: () => void; aoConcluir: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setSenha('');
    setErro(null);
    setEnviando(false);
  }, [conta]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!conta) return;
    setErro(null);
    const problemas = validarSenha(senha);
    if (problemas.length > 0) {
      setErro(problemas[0].mensagem);
      return;
    }
    setEnviando(true);
    try {
      await chamarAdminUsuarios('definir_senha_temporaria', { perfil_id: conta.id, senha });
      aoFechar();
      avisarSucesso('Senha temporária definida. Combine com a pessoa por fora do app.');
      aoConcluir();
    } catch (e) {
      avisarErro(mensagemDeErro(e));
      setEnviando(false);
    }
  }

  return (
    <Dialog open={conta !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={enviar} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Senha temporária</DialogTitle>
            <DialogDescription>
              Combine a senha com a pessoa por fora do app: o sistema não envia e-mails. Ela será obrigada a trocar no próximo login.
            </DialogDescription>
          </DialogHeader>
          <CampoTexto id="senha-temporaria" rotulo={`Senha temporária para ${conta?.nome_exibicao ?? ''}`} required autoComplete="off"
            dica="Pelo menos 10 caracteres." value={senha} onChange={(e) => setSenha(e.target.value)} erro={erro}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? <Loader2 className="animate-spin" /> : null}
              Definir senha temporária
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoArquivarLocais({ conta, aoFechar, aoConcluir }: { conta: ContaAdmin | null; aoFechar: () => void; aoConcluir: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setMotivo('');
    setErro(null);
    setEnviando(false);
  }, [conta]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!conta) return;
    setErro(null);
    const problemas = validarMotivoArquivamento(motivo);
    if (problemas.length > 0) {
      setErro(problemas[0].mensagem);
      return;
    }
    setEnviando(true);
    const { data, error } = await supabase.rpc('admin_arquivar_locais_da_conta', { p_perfil: conta.id, p_motivo: motivo.trim() });
    if (error) {
      avisarErro(mensagemDeErro(error));
      setEnviando(false);
      return;
    }
    aoFechar();
    avisarSucesso(`${data} local(is) arquivado(s).`);
    aoConcluir();
  }

  return (
    <Dialog open={conta !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={enviar} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{`Arquivar locais de ${conta?.nome_exibicao ?? ''}`}</DialogTitle>
            <DialogDescription>
              {`Arquiva todos os ${conta?.locais_ativos ?? 0} locais ativos marcados ou ativados por ${conta?.nome_exibicao ?? ''} e cancela os agendamentos futuros deles. Nada é apagado.`}
            </DialogDescription>
          </DialogHeader>
          <CampoTexto id="motivo-massa" rotulo="Motivo do arquivamento" maxLength={300} required
            dica="De 3 a 300 caracteres." value={motivo} onChange={(e) => setMotivo(e.target.value)} erro={erro}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={enviando}>
              {enviando ? <Loader2 className="animate-spin" /> : null}
              Arquivar todos os locais da conta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Pedidos de limite
// ===========================================================================
function SecaoPedidos({ aoAtualizarContadores }: { aoAtualizarContadores: () => void }) {
  const [pedidos, setPedidos] = useState<PedidoAdmin[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const novaCarga = useCargaRecente();

  const carregar = useCallback(async () => {
    const vigente = novaCarga();
    const { data, error } = await supabase.rpc('admin_listar_pedidos', { p_status: 'aberto' });
    if (!vigente()) return;
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setErro(null);
    setPedidos((data as PedidoAdmin[]) ?? []);
  }, [novaCarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(pedido: PedidoAdmin, aprovar: boolean) {
    const { error } = await supabase.rpc('admin_decidir_pedido', { p_id: pedido.id, p_aprovar: aprovar });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso(aprovar ? `${pedido.nome_exibicao} ficou sem limite diário.` : `Pedido de ${pedido.nome_exibicao} recusado.`);
    aoAtualizarContadores();
    void carregar();
  }

  return (
    <>
      <CabecalhoPagina titulo="Pedidos de limite" descricao="Pedidos abertos de voluntários que chegaram ao limite diário." />
      {erro ? <Erro mensagem={erro} /> : pedidos === null ? <Carregando linhas={2} /> : pedidos.length === 0 ? (
        <Vazio icone={<Hand />} titulo="Nenhum pedido aberto." />
      ) : (
        <Lista>
          {pedidos.map((pedido) => (
            <LinhaLista key={pedido.id}>
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <AvatarConta nome={pedido.nome_exibicao} />
                <div className="grid min-w-0 flex-1 gap-1">
                  <strong className="truncate text-sm font-semibold">{pedido.nome_exibicao}</strong>
                  <span className="text-muted-foreground truncate text-[13px]">{pedido.email}</span>
                  <Meta>
                    <span>{`Pedido em ${formatarMomento(pedido.criado_em)}`}</span>
                    <span>{`${pedido.locais_total} locais no total`}</span>
                    <span>{`${pedido.marcados_hoje} marcados hoje`}</span>
                  </Meta>
                </div>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button size="sm" className="h-8 flex-1 sm:flex-none" onClick={() => void decidir(pedido, true)}>Aprovar</Button>
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10 h-8 flex-1 sm:flex-none"
                  onClick={() => void decidir(pedido, false)}>Recusar</Button>
              </div>
            </LinhaLista>
          ))}
        </Lista>
      )}
    </>
  );
}

// ===========================================================================
// Histórico
// ===========================================================================
const TABELAS = ['perfis', 'locais', 'agendamentos', 'pedidos_limite', 'config', 'importacao'];

function diferenca(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null): string {
  if (!depois) return 'registro removido';
  if (!antes) return `criado: ${resumo(depois)}`;
  const linhas: string[] = [];
  for (const chave of Object.keys(depois)) {
    const a = JSON.stringify(antes[chave] ?? null);
    const d = JSON.stringify(depois[chave] ?? null);
    if (a !== d) linhas.push(`${chave}: ${a} → ${d}`);
  }
  return linhas.length > 0 ? linhas.join('\n') : 'sem mudança de valor';
}

function resumo(objeto: Record<string, unknown>): string {
  const interessantes = ['nome', 'nome_exibicao', 'status', 'papel', 'tipo', 'dia', 'origem', 'novos', 'atualizados'];
  const partes = interessantes
    .filter((chave) => objeto[chave] !== undefined && objeto[chave] !== null)
    .map((chave) => `${chave}=${String(objeto[chave])}`);
  return partes.length > 0 ? partes.join(', ') : JSON.stringify(objeto).slice(0, 200);
}

function SecaoHistorico() {
  const [filtro, setFiltro] = useState({ tabela: '', acao: '', registro: '', de: '', ate: '' });
  const [linhas, setLinhas] = useState<LinhaHistorico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const novaCarga = useCargaRecente();
  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;

  const carregar = useCallback(async () => {
    const vigente = novaCarga();
    const f = filtroRef.current;
    const { data, error } = await supabase.rpc('admin_historico', {
      p_tabela: f.tabela || null,
      p_registro_id: f.registro.trim() || null,
      p_acao: f.acao.trim() || null,
      p_de: f.de ? `${f.de}T00:00:00-03:00` : null,
      p_ate: f.ate ? `${f.ate}T23:59:59-03:00` : null,
      p_limite: 100,
    });
    if (!vigente()) return;
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setErro(null);
    setLinhas((data as LinhaHistorico[]) ?? []);
  }, [novaCarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function restaurar(linha: LinhaHistorico) {
    const { error } = await supabase.rpc('restaurar_local', { p_id: linha.registro_id, p_historico_id: linha.id });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso('Local restaurado para a versão escolhida.');
    void carregar();
  }

  const mudar = (campo: keyof typeof filtro) => (e: { target: { value: string } }) =>
    setFiltro((atual) => ({ ...atual, [campo]: e.target.value }));

  return (
    <>
      <CabecalhoPagina
        titulo="Histórico"
        descricao="Tudo que foi criado ou alterado. O histórico só aceita inserções: nada aqui pode ser alterado nem apagado."
      />

      <details className="group bg-card rounded-xl border shadow-xs">
        <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
          <Filter className="text-muted-foreground size-4" />
          Filtros
          <ChevronDown className="text-muted-foreground ml-auto size-4 transition-transform group-open:rotate-180" />
        </summary>
        <form
          className="grid gap-4 border-t p-4"
          onSubmit={(e) => { e.preventDefault(); void carregar(); }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="hist-tabela" rotulo="Tabela">
              <NativeSelect id="hist-tabela" value={filtro.tabela} onChange={mudar('tabela')}>
                <NativeSelectOption value="">Todas</NativeSelectOption>
                {TABELAS.map((t) => <NativeSelectOption key={t} value={t}>{t}</NativeSelectOption>)}
              </NativeSelect>
            </Campo>
            <CampoTexto id="hist-acao" rotulo="Ação" dica="Ex.: arquivar_local, admin_definir_status" value={filtro.acao} onChange={mudar('acao')} />
          </div>
          <CampoTexto id="hist-registro" rotulo="Identificador do registro" value={filtro.registro} onChange={mudar('registro')} />
          <div className="grid grid-cols-2 gap-4">
            <CampoTexto id="hist-de" rotulo="De" type="date" value={filtro.de} onChange={mudar('de')} />
            <CampoTexto id="hist-ate" rotulo="Até" type="date" value={filtro.ate} onChange={mudar('ate')} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" className="h-10 min-w-28">Filtrar</Button>
          </div>
        </form>
      </details>

      {erro ? <Erro mensagem={erro} /> : linhas === null ? <Carregando /> : linhas.length === 0 ? (
        <Vazio icone={<History />} titulo="Nenhuma alteração com esses filtros." />
      ) : (
        <Lista>
          {linhas.map((linha) => (
            <LinhaLista key={linha.id} className="sm:items-start">
              <div className="grid min-w-0 flex-1 gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-semibold">
                    {ROTULO_ACAO[linha.acao] ?? `${linha.acao} em ${ROTULO_TABELA[linha.tabela] ?? linha.tabela}`}
                  </strong>
                  <Badge variant="secondary" className="font-normal">{ROTULO_TABELA[linha.tabela] ?? linha.tabela}</Badge>
                </div>
                <Meta>
                  <span>{formatarMomento(linha.feito_em)}</span>
                  <span>{`por ${linha.autor_nome}`}</span>
                  <span className="font-mono">{`registro ${linha.registro_id.slice(0, 8)}`}</span>
                </Meta>
                <pre className="bg-muted/60 text-muted-foreground mt-1 overflow-x-auto rounded-md px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                  {diferenca(linha.antes, linha.depois)}
                </pre>
              </div>
              {linha.tabela === 'locais' && linha.depois ? (
                <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void restaurar(linha)}>
                  <RotateCcw />
                  Restaurar esta versão
                </Button>
              ) : null}
            </LinhaLista>
          ))}
        </Lista>
      )}
    </>
  );
}

// ===========================================================================
// Controle
// ===========================================================================
function SecaoControle() {
  const [ligado, setLigado] = useState(estado.config?.somente_leitura ?? false);
  const [mudando, setMudando] = useState(false);
  const [exportando, setExportando] = useState(false);

  async function alternar(ligar: boolean) {
    setMudando(true);
    const { error } = await supabase.rpc('admin_somente_leitura', { p_ligado: ligar });
    if (error) {
      avisarErro(mensagemDeErro(error));
      setMudando(false);
      return;
    }
    await carregarSessao();
    avisarSucesso(ligar ? 'Modo somente leitura ligado.' : 'Modo somente leitura desligado.');
    setLigado(estado.config?.somente_leitura ?? ligar);
    setMudando(false);
  }

  async function exportar() {
    setExportando(true);
    avisar('Montando a exportação...');
    try {
      const [contas, locais, pedidos, historico] = await Promise.all([
        supabase.rpc('admin_listar_contas', { p_limite: 500 }),
        supabase.from('locais').select('id, nome, tipo, uf, municipio_id, status, origem, origem_id, endereco, melhor_horario, observacoes, criado_por, ativado_por, ativado_em, arquivado_por, arquivado_em, motivo_arquivamento, criado_em').limit(10000),
        supabase.from('pedidos_limite').select('id, perfil_id, status, criado_em, decidido_por, decidido_em').limit(10000),
        supabase.rpc('admin_historico', { p_limite: 500 }),
      ]);
      const arquivos: Array<[string, unknown[]]> = [
        ['contas', (contas.data as unknown[]) ?? []],
        ['locais', (locais.data as unknown[]) ?? []],
        ['pedidos-limite', (pedidos.data as unknown[]) ?? []],
        ['historico', (historico.data as unknown[]) ?? []],
      ];
      for (const [nome, linhas] of arquivos) {
        if (linhas.length === 0) continue;
        baixarArquivo(`mapa-de-campanha-${nome}.csv`, escreverCsvCliente(linhas as Array<Record<string, unknown>>));
      }
      avisarSucesso('Exportação baixada. Guarde os arquivos fora do Supabase.');
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Controle" />

      <Card className={cn('gap-4', ligado && 'border-aviso/40')}>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5',
              ligado ? 'bg-aviso-suave text-aviso' : 'bg-muted text-muted-foreground',
            )}>
              {ligado ? <Lock /> : <Unlock />}
            </span>
            <div className="grid gap-1.5">
              <CardTitle role="heading" aria-level={3}>Modo somente leitura</CardTitle>
              <CardDescription className="leading-relaxed">
                Com o modo ligado, nenhum voluntário escreve: ninguém marca local, edita, arquiva nem se agenda. Os
                administradores continuam escrevendo. Use em caso de ataque.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className={cn('size-2 rounded-full', ligado ? 'bg-aviso' : 'bg-visitado')} />
            {ligado ? 'O modo somente leitura está LIGADO.' : 'O modo somente leitura está desligado.'}
          </p>
          <Button variant={ligado ? 'default' : 'destructive'} className="h-10" disabled={mudando} onClick={() => void alternar(!ligado)}>
            {mudando ? <Loader2 className="animate-spin" /> : null}
            {ligado ? 'Desligar modo somente leitura' : 'Ligar modo somente leitura'}
          </Button>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5">
              <Download />
            </span>
            <div className="grid gap-1.5">
              <CardTitle role="heading" aria-level={3}>Backup</CardTitle>
              <CardDescription className="leading-relaxed">
                Exporta a base em CSV, sem senhas. Guarde os arquivos fora do Supabase. Para o backup diário completo,
                use scripts/exportar.ts com a chave de serviço.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="h-10" disabled={exportando} onClick={() => void exportar()}>
            {exportando ? <Loader2 className="animate-spin" /> : <Download />}
            Exportar base (CSV)
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
