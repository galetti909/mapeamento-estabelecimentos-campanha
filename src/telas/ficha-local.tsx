import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Archive, CalendarDays, CalendarPlus, CircleCheck, Clock, Database, Loader2, Lock, MapPin, NotebookText,
  Pencil, Signpost, User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Campo, CampoTexto } from '@/components/campo';
import { Input } from '@/components/ui/input';
import { Painel } from '@/components/painel';
import { LinhaLista, Lista } from '@/components/pagina';
import { avisarErro, avisarSucesso } from '@/lib/avisos';
import { formatarDiaCurto, formatarHora, hojeBrasilia, somarDias } from '@/lib/datas';
import { mensagemDeErro } from '@/lib/erros';
import { ICONE_DO_TIPO } from '@/lib/icones';
import { ROTULO_ORIGEM, ROTULO_STATUS_LOCAL, ROTULO_TIPO } from '@/lib/rotulos';
import { podeEscrever, souAdmin } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import type { ItemAgenda, LocalDetalhe, MeuLimite } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { validarAgendamento, validarMotivoArquivamento } from '@/lib/validacao';
import { DataAgendamento } from './meus-agendamentos';
import { FormularioLocal } from './formulario-local';

interface Props {
  localId: string;
  limite: MeuLimite | null;
  aoFechar: () => void;
  /** Recarrega os marcadores do mapa depois de uma mudança. */
  aoMudar: () => void;
  aoPedirLimite: () => void;
}

type Vista = 'ficha' | 'editar' | 'arquivar' | 'agendar';

interface Dados {
  local: LocalDetalhe;
  agenda: ItemAgenda[];
  visitado: boolean;
}

/** Ficha completa do local, num painel ao lado (ou embaixo) do mapa. */
export function FichaLocal({ localId, limite, aoFechar, aoMudar, aoPedirLimite }: Props) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [vista, setVista] = useState<Vista>('ficha');

  const carregar = useCallback(async () => {
    const [detalhe, agenda, visitado] = await Promise.all([
      supabase.rpc('local_detalhe', { p_id: localId }),
      supabase.rpc('agenda_do_local', { p_local_id: localId }),
      supabase.rpc('local_foi_visitado', { p_id: localId }),
    ]);

    if (detalhe.error) {
      avisarErro(mensagemDeErro(detalhe.error));
      aoFechar();
      return;
    }
    const local = (detalhe.data as LocalDetalhe[])[0];
    if (!local) {
      avisarErro('Local não encontrado.');
      aoFechar();
      return;
    }
    setDados({
      local,
      agenda: (agenda.error ? [] : (agenda.data as ItemAgenda[])) ?? [],
      visitado: visitado.error ? false : Boolean(visitado.data),
    });
    setVista('ficha');
  }, [localId, aoFechar]);

  useEffect(() => {
    setDados(null);
    void carregar();
  }, [carregar]);

  const mudou = () => {
    aoMudar();
    void carregar();
  };

  const local = dados?.local;

  return (
    <Painel
      rotulo="Ficha do local"
      rotuloFechar="Fechar ficha do local"
      aoFechar={aoFechar}
      titulo={local ? local.nome : 'Carregando...'}
      sobretitulo={dados ? <Etiquetas dados={dados} /> : <Skeleton className="h-5 w-32" />}
    >
      {!dados || !local ? (
        <div className="grid gap-3" aria-label="Carregando a ficha...">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-3 h-24 w-full rounded-xl" />
        </div>
      ) : vista === 'editar' ? (
        <Subtela titulo="Editar local">
          <FormularioLocal local={local} limite={limite} aoSalvar={mudou} aoFechar={() => setVista('ficha')} aoPedirLimite={aoPedirLimite} />
        </Subtela>
      ) : vista === 'arquivar' ? (
        <Subtela titulo="Arquivar local">
          <FormularioArquivar local={local} aoVoltar={() => setVista('ficha')} aoArquivar={mudou} />
        </Subtela>
      ) : vista === 'agendar' ? (
        <Subtela titulo="Me agendar">
          <FormularioAgendar local={local} aoVoltar={() => setVista('ficha')} aoAgendar={mudou} />
        </Subtela>
      ) : (
        <Ficha dados={dados} aoMudar={mudou} aoVista={setVista} />
      )}
    </Painel>
  );
}

function Etiquetas({ dados }: { dados: Dados }) {
  const { local, visitado } = dados;
  const IconeTipo = ICONE_DO_TIPO[local.tipo];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="gap-1 font-medium">
        <IconeTipo />
        {ROTULO_TIPO[local.tipo]}
      </Badge>
      {local.status === 'ativo' ? (
        visitado ? (
          <Badge className="bg-visitado-suave text-visitado-forte gap-1 border-transparent">
            <span className="bg-visitado size-1.5 rounded-full" />Visitado
          </Badge>
        ) : (
          <Badge className="bg-ponto-suave text-ponto-forte gap-1 border-transparent">
            <span className="bg-ponto size-1.5 rounded-full" />A visitar
          </Badge>
        )
      ) : null}
      <Badge variant="secondary" className={cn('etiqueta', local.status)}>{ROTULO_STATUS_LOCAL[local.status]}</Badge>
    </div>
  );
}

function Subtela({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="grid gap-4">
      <h3 className="text-base font-semibold">{titulo}</h3>
      {children}
    </div>
  );
}

function Ficha({ dados, aoMudar, aoVista }: { dados: Dados; aoMudar: () => void; aoVista: (vista: Vista) => void }) {
  const { local, agenda } = dados;
  const escrever = podeEscrever();
  const podeAgendar = local.status === 'ativo' && escrever;
  const podeAlterar = local.posso_alterar && local.status !== 'arquivado';

  async function ativar() {
    const { error } = await supabase.rpc('ativar_importado', { p_id: local.id });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso('Local ativado. Agora ele aparece na camada de locais ativos.');
    aoMudar();
  }

  async function cancelar(agendamentoId: string) {
    const { error } = await supabase.rpc('cancelar_agendamento', { p_id: agendamentoId });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso('Agendamento cancelado.');
    aoMudar();
  }

  return (
    <div className="grid gap-6">
      {local.status === 'arquivado' && local.motivo_arquivamento ? (
        <div className="border-destructive/30 bg-destructive/5 flex gap-3 rounded-lg border p-3.5">
          <Archive className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="grid gap-0.5 text-sm">
            <strong className="font-semibold">Local arquivado</strong>
            <p className="text-muted-foreground">{local.motivo_arquivamento}</p>
          </div>
        </div>
      ) : null}

      <dl className="grid gap-3.5">
        <Dado icone={<MapPin />} rotulo="Município">
          {`${local.municipio_nome ?? '—'}${local.uf ? ` (${local.uf})` : ''}`}
        </Dado>
        {local.endereco ? <Dado icone={<Signpost />} rotulo="Endereço">{local.endereco}</Dado> : null}
        {local.melhor_horario ? <Dado icone={<Clock />} rotulo="Horário">{local.melhor_horario}</Dado> : null}
        {local.observacoes ? <Dado icone={<NotebookText />} rotulo="Observações">{local.observacoes}</Dado> : null}
        <Dado icone={<Database />} rotulo="Origem">{ROTULO_ORIGEM[local.origem]}</Dado>
      </dl>

      <Separator />

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {`Agenda${agenda.length > 0 ? ` (${agenda.length})` : ''}`}
          </h3>
        </div>
        {agenda.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-3 rounded-lg border border-dashed px-4 py-3.5 text-sm">
            <CalendarDays className="size-4 shrink-0" />
            Ninguém se agendou para este local ainda.
          </div>
        ) : (
          <Lista className="shadow-none">
            {agenda.map((item) => (
              <LinhaLista key={item.id} className="flex-nowrap items-center px-3 py-2.5 sm:px-3">
                <DataAgendamento dia={item.dia} />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <strong className="text-sm font-semibold tabular-nums">
                    {`${formatarDiaCurto(item.dia)} · ${formatarHora(item.hora_inicio)}–${formatarHora(item.hora_fim)}`}
                  </strong>
                  <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-[13px]">
                    <User className="size-3.5 shrink-0" />
                    <span className="truncate">{item.nome_exibicao}</span>
                    {item.meu ? <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">você</Badge> : null}
                  </span>
                </div>
                {item.meu || souAdmin() ? (
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 shrink-0"
                    onClick={() => void cancelar(item.id)}>
                    Cancelar
                  </Button>
                ) : null}
              </LinhaLista>
            ))}
          </Lista>
        )}
        {podeAgendar ? (
          <Button className="bg-ponto hover:bg-ponto-forte h-11 w-full text-white shadow-sm" onClick={() => aoVista('agendar')}>
            <CalendarPlus />
            Me agendar
          </Button>
        ) : null}
      </section>

      {!escrever ? (
        <div className="border-aviso/30 bg-aviso-suave flex items-center gap-3 rounded-lg border p-3.5 text-sm">
          <Lock className="text-aviso size-4 shrink-0" />
          O mapa está somente para leitura neste momento.
        </div>
      ) : local.status === 'importado' || podeAlterar ? (
        <section className="grid gap-3">
          <Separator />
          <h3 className="text-sm font-semibold">Ações</h3>
          {local.status === 'importado' ? (
            <Button className="h-11 w-full" onClick={() => void ativar()}>
              <CircleCheck />
              Ativar este local
            </Button>
          ) : null}
          {podeAlterar ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-10" onClick={() => aoVista('editar')}>
                <Pencil />
                Editar
              </Button>
              <Button variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 h-10"
                onClick={() => aoVista('arquivar')}>
                <Archive />
                Arquivar
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Dado({ icone, rotulo, children }: { icone: ReactNode; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4">
        {icone}
      </span>
      <div className="grid min-w-0 gap-0.5">
        <dt className="text-muted-foreground text-xs font-medium">{rotulo}</dt>
        <dd className="text-sm leading-relaxed break-words whitespace-pre-line">{children}</dd>
      </div>
    </div>
  );
}

function FormularioArquivar({ local, aoVoltar, aoArquivar }: { local: LocalDetalhe; aoVoltar: () => void; aoArquivar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const problemas = validarMotivoArquivamento(motivo);
    if (problemas.length > 0) {
      setErro(problemas[0].mensagem);
      evento.currentTarget.querySelector<HTMLInputElement>('#arquivar-motivo')?.focus();
      return;
    }
    setEnviando(true);
    const { error } = await supabase.rpc('arquivar_local', { p_id: local.id, p_motivo: motivo.trim() });
    if (error) {
      avisarErro(mensagemDeErro(error));
      setEnviando(false);
      return;
    }
    avisarSucesso('Local arquivado. Nada foi apagado: um administrador pode restaurar.');
    aoArquivar();
  }

  return (
    <form noValidate onSubmit={enviar} className="grid gap-4">
      <CampoTexto id="arquivar-motivo" rotulo="Motivo do arquivamento" maxLength={300} required autoFocus
        dica="De 3 a 300 caracteres. O arquivamento cancela os agendamentos futuros deste local."
        value={motivo} onChange={(e) => setMotivo(e.target.value)} erro={erro}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-10" onClick={aoVoltar}>Voltar</Button>
        <Button type="submit" variant="destructive" className="h-10" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : null}
          Arquivar local
        </Button>
      </div>
    </form>
  );
}

function FormularioAgendar({ local, aoVoltar, aoAgendar }: { local: LocalDetalhe; aoVoltar: () => void; aoAgendar: () => void }) {
  const hoje = hojeBrasilia();
  const [dia, setDia] = useState(hoje);
  const [inicio, setInicio] = useState('09:00');
  const [fim, setFim] = useState('11:00');
  const [erros, setErros] = useState<{ dia?: string; hora?: string }>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErros({});
    const problemas = validarAgendamento(dia, inicio, fim, hoje);
    if (problemas.length > 0) {
      const novos: typeof erros = {};
      for (const problema of problemas) novos[problema.campo === 'dia' ? 'dia' : 'hora'] ??= problema.mensagem;
      setErros(novos);
      return;
    }
    setEnviando(true);
    const { error } = await supabase.rpc('agendar', {
      p_local_id: local.id,
      p_dia: dia,
      p_hora_inicio: inicio,
      p_hora_fim: fim,
    });
    if (error) {
      avisarErro(mensagemDeErro(error));
      setEnviando(false);
      return;
    }
    avisarSucesso('Agendamento confirmado.');
    aoAgendar();
  }

  return (
    <form noValidate onSubmit={enviar} className="grid gap-4">
      <CampoTexto id="agendar-dia" rotulo="Dia" type="date" required min={hoje} max={somarDias(hoje, 60)}
        dica="De hoje até 60 dias à frente." value={dia} onChange={(e) => setDia(e.target.value)} erro={erros.dia}
      />
      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-3">
          <Campo id="agendar-inicio" rotulo="Das">
            <Input id="agendar-inicio" type="time" required value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
          <Campo id="agendar-fim" rotulo="Às">
            <Input id="agendar-fim" type="time" required value={fim} onChange={(e) => setFim(e.target.value)}
              aria-invalid={erros.hora ? true : undefined}
            />
          </Campo>
        </div>
        {erros.hora ? <p role="alert" className="text-destructive text-[13px] font-medium">{erros.hora}</p> : null}
      </div>
      <div className="mt-1 grid gap-2">
        <Button type="submit" className="h-11 w-full" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : null}
          Confirmar agendamento
        </Button>
        <Button type="button" variant="ghost" className="h-10 w-full" onClick={aoVoltar}>Voltar</Button>
      </div>
    </form>
  );
}
