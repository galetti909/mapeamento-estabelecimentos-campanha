import { useRef, useState, type FormEvent } from 'react';
import { Crosshair, Hand, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Campo, CampoTexto, CampoTextoLongo } from '@/components/campo';
import { avisarErro, avisarSucesso } from '@/lib/avisos';
import { mensagemDeErro } from '@/lib/erros';
import { ROTULO_TIPO } from '@/lib/rotulos';
import { supabase } from '@/lib/supabase';
import { TIPOS_LOCAL, type LocalDetalhe, type MeuLimite, type TipoLocal } from '@/lib/tipos';
import { validarLocal } from '@/lib/validacao';

interface Props {
  /** Posição escolhida no mapa (só na criação). */
  posicao?: { lat: number; lng: number };
  /** Local existente (edição). */
  local?: LocalDetalhe;
  limite?: MeuLimite | null;
  aoSalvar: (id: string) => void;
  aoFechar: () => void;
  aoPedirLimite: () => void;
}

type CampoLocal = 'nome' | 'endereco' | 'melhor_horario' | 'observacoes';

const IDS: Record<CampoLocal, string> = {
  nome: 'local-nome',
  endereco: 'local-endereco',
  melhor_horario: 'local-horario',
  observacoes: 'local-observacoes',
};

export function FormularioLocal({ posicao, local, limite, aoSalvar, aoFechar, aoPedirLimite }: Props) {
  const editando = Boolean(local);
  const [valores, setValores] = useState({
    nome: local?.nome ?? '',
    tipo: (local?.tipo ?? 'feira') as TipoLocal,
    endereco: local?.endereco ?? '',
    melhor_horario: local?.melhor_horario ?? '',
    observacoes: local?.observacoes ?? '',
  });
  const [erros, setErros] = useState<Partial<Record<CampoLocal, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);

  const mudar = (campo: keyof typeof valores) => (e: { target: { value: string } }) =>
    setValores((atual) => ({ ...atual, [campo]: e.target.value }));

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErros({});

    const problemas = validarLocal(valores);
    if (problemas.length > 0) {
      const novos: Partial<Record<CampoLocal, string>> = {};
      for (const problema of problemas) novos[problema.campo as CampoLocal] ??= problema.mensagem;
      setErros(novos);
      formulario.current?.querySelector<HTMLElement>(`#${IDS[problemas[0].campo as CampoLocal]}`)?.focus();
      return;
    }

    setEnviando(true);
    const comuns = {
      p_nome: valores.nome.trim(),
      p_tipo: valores.tipo,
      p_endereco: valores.endereco.trim() || null,
      p_melhor_horario: valores.melhor_horario.trim() || null,
      p_observacoes: valores.observacoes.trim() || null,
    };

    try {
      if (editando && local) {
        const { error } = await supabase.rpc('editar_local', { p_id: local.id, ...comuns });
        if (error) throw error;
        avisarSucesso('Local atualizado.');
        aoSalvar(local.id);
      } else {
        if (!posicao) throw new Error('posicao_invalida');
        const { data, error } = await supabase.rpc('marcar_local', { ...comuns, p_lat: posicao.lat, p_lng: posicao.lng });
        if (error) throw error;
        avisarSucesso('Local marcado. Ele já aparece no mapa para todos.');
        aoSalvar(data as string);
      }
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
      setEnviando(false);
    }
  }

  const noLimite = !editando && limite && !limite.sem_limite && (limite.restantes ?? 0) <= 0;
  const restantes = !editando && limite && !limite.sem_limite && (limite.restantes ?? 0) > 0 ? limite.restantes : null;

  return (
    <div className="grid gap-5">
      {posicao ? (
        <div className="bg-ponto-suave/60 border-ponto/20 flex items-center gap-3 rounded-lg border px-3.5 py-3">
          <span className="bg-ponto flex size-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm">
            <Crosshair className="size-4" />
          </span>
          <div className="grid leading-tight">
            <strong className="text-sm font-semibold">Posição escolhida</strong>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {`${posicao.lat.toFixed(5)}, ${posicao.lng.toFixed(5)}`}
            </span>
          </div>
          {restantes !== null ? (
            <span className="text-muted-foreground ml-auto text-right text-xs leading-tight">
              Restam <strong className="text-foreground">{restantes}</strong>
              <br />marcações hoje.
            </span>
          ) : null}
        </div>
      ) : null}

      {noLimite ? (
        <div className="border-aviso/30 bg-aviso-suave grid gap-3 rounded-lg border p-4">
          <div className="flex gap-3">
            <Hand className="text-aviso mt-0.5 size-5 shrink-0" />
            <div className="grid gap-1">
              <strong className="text-sm font-semibold">{`Você chegou ao limite de ${limite.limite} locais por hoje.`}</strong>
              {limite.pedido_aberto ? (
                <p className="text-muted-foreground text-[13px]">Seu pedido de liberação está aguardando análise de um administrador.</p>
              ) : (
                <p className="text-muted-foreground text-[13px]">Peça a um administrador para liberar mais marcações.</p>
              )}
            </div>
          </div>
          {limite.pedido_aberto ? null : (
            <Button className="h-10 w-full" onClick={aoPedirLimite}>Pedir liberação do limite</Button>
          )}
        </div>
      ) : (
        <form ref={formulario} noValidate onSubmit={enviar} className="grid gap-4">
          <CampoTexto id="local-nome" rotulo="Nome do local" maxLength={80} required dica="De 2 a 80 caracteres."
            value={valores.nome} onChange={mudar('nome')} erro={erros.nome}
          />
          <Campo id="local-tipo" rotulo="Tipo">
            <NativeSelect id="local-tipo" name="local-tipo" value={valores.tipo} onChange={mudar('tipo')}>
              {TIPOS_LOCAL.map((tipo) => (
                <NativeSelectOption key={tipo} value={tipo}>{ROTULO_TIPO[tipo]}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Campo>
          <CampoTexto id="local-endereco" rotulo="Endereço (opcional)" maxLength={160}
            value={valores.endereco} onChange={mudar('endereco')} erro={erros.endereco}
          />
          <CampoTexto id="local-horario" rotulo="Melhor horário (opcional)" maxLength={80}
            dica="Ex.: sábados de manhã, fim da tarde nos dias de semana."
            value={valores.melhor_horario} onChange={mudar('melhor_horario')} erro={erros.melhor_horario}
          />
          {/* A dica orienta; a mensagem de dado pessoal só aparece quando o
              texto realmente traz um dado pessoal. */}
          <CampoTextoLongo id="local-observacoes" rotulo="Observações (opcional)" maxLength={500}
            dica="O que ajuda outro voluntário: movimento, pontos de referência, cuidados do local."
            value={valores.observacoes} onChange={mudar('observacoes')} erro={erros.observacoes}
          />
          <div className="mt-1 grid gap-2">
            <Button type="submit" className="h-11 w-full" disabled={enviando}>
              {enviando ? <><Loader2 className="animate-spin" />Salvando...</> : editando ? 'Salvar alterações' : 'Salvar local'}
            </Button>
            <Button type="button" variant="ghost" className="h-10 w-full" onClick={aoFechar}>Cancelar</Button>
          </div>
        </form>
      )}
    </div>
  );
}
