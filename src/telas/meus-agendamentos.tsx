import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CircleAlert, Clock, MapPin } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CabecalhoPagina, LinhaLista, Lista, Pagina, Vazio } from '@/components/pagina';
import { avisarErro, avisarSucesso } from '@/lib/avisos';
import { formatarDiaCurto, formatarHora } from '@/lib/datas';
import { mensagemDeErro } from '@/lib/erros';
import { podeEscrever } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import type { MeuAgendamento } from '@/lib/tipos';

/** Lista dos próprios agendamentos de hoje em diante. */
export function TelaMeusAgendamentos({ aoAbrirLocal }: { aoAbrirLocal: (localId: string) => void }) {
  const [itens, setItens] = useState<MeuAgendamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('meus_agendamentos');
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setErro(null);
    setItens((data as MeuAgendamento[]) ?? []);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function cancelar(id: string) {
    const { error } = await supabase.rpc('cancelar_agendamento', { p_id: id });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso('Agendamento cancelado.');
    void carregar();
  }

  return (
    <Pagina>
      <CabecalhoPagina titulo="Meus agendamentos" descricao="Apenas os seus agendamentos de hoje em diante." />

      {erro ? (
        <Alert variant="destructive"><CircleAlert /><AlertDescription>{erro}</AlertDescription></Alert>
      ) : itens === null ? (
        <div className="grid gap-2">
          <Skeleton className="h-[72px] w-full rounded-xl" />
          <Skeleton className="h-[72px] w-full rounded-xl" />
        </div>
      ) : itens.length === 0 ? (
        <Vazio icone={<CalendarDays />} titulo="Você não tem agendamentos futuros." dica='Abra um local no mapa e use "Me agendar".' />
      ) : (
        <Lista>
          {itens.map((item) => (
            <LinhaLista key={item.id}>
              <DataAgendamento dia={item.dia} />
              <div className="grid min-w-0 flex-1 gap-1">
                <strong className="truncate text-sm font-semibold">{item.local_nome}</strong>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {`${formatarDiaCurto(item.dia)} · ${formatarHora(item.hora_inicio)}–${formatarHora(item.hora_fim)}`}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    {`${item.municipio_nome ?? '—'}${item.uf ? ` (${item.uf})` : ''}`}
                  </span>
                </span>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button variant="outline" size="sm" className="h-9 flex-1 sm:flex-none" onClick={() => aoAbrirLocal(item.local_id)}>
                  Ver no mapa
                </Button>
                {podeEscrever() ? (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 flex-1 sm:flex-none"
                    onClick={() => void cancelar(item.id)}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </LinhaLista>
          ))}
        </Lista>
      )}
    </Pagina>
  );
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Folhinha de calendário com o dia e o mês. */
export function DataAgendamento({ dia }: { dia: string }) {
  const [, mes, d] = dia.split('-');
  return (
    <span aria-hidden="true" className="bg-ponto-suave text-ponto-forte flex size-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none">
      <span className="text-[15px] font-bold tabular-nums">{d}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">{MESES[Number(mes) - 1]}</span>
    </span>
  );
}
