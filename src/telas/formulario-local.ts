import { botao, campo, el, mostrarErroCampo, selecao } from '../lib/dom.js';
import { avisarErro, avisarSucesso } from '../lib/avisos.js';
import { mensagemDeErro } from '../lib/erros.js';
import { supabase } from '../lib/supabase.js';
import { ROTULO_TIPO } from '../lib/rotulos.js';
import { TIPOS_LOCAL, type LocalDetalhe, type MeuLimite, type TipoLocal } from '../lib/tipos.js';
import { validarLocal } from '../lib/validacao.js';
import { icone } from '../lib/icones.js';

interface Opcoes {
  /** Posicao escolhida no mapa (so na criacao). */
  posicao?: { lat: number; lng: number };
  /** Local existente (edicao). */
  local?: LocalDetalhe;
  limite?: MeuLimite | null;
  aoSalvar: (id: string) => void;
  aoFechar: () => void;
  aoPedirLimite: () => void;
}

const ITENS_TIPO = TIPOS_LOCAL.map((tipo) => ({ valor: tipo, texto: ROTULO_TIPO[tipo] }));

export function formularioLocal(opcoes: Opcoes): HTMLElement {
  const editando = Boolean(opcoes.local);

  const nome = campo({
    id: 'local-nome',
    rotulo: 'Nome do local',
    maxlength: 80,
    obrigatorio: true,
    valor: opcoes.local?.nome ?? '',
    dica: 'De 2 a 80 caracteres.',
  });
  const tipo = selecao({
    id: 'local-tipo',
    rotulo: 'Tipo',
    itens: ITENS_TIPO,
    valor: opcoes.local?.tipo ?? 'feira',
  });
  const endereco = campo({
    id: 'local-endereco',
    rotulo: 'Endereço (opcional)',
    maxlength: 160,
    valor: opcoes.local?.endereco ?? '',
  });
  const horario = campo({
    id: 'local-horario',
    rotulo: 'Melhor horário (opcional)',
    maxlength: 80,
    valor: opcoes.local?.melhor_horario ?? '',
    dica: 'Ex.: sábados de manhã, fim da tarde nos dias de semana.',
  });
  const observacoes = campo({
    id: 'local-observacoes',
    rotulo: 'Observações (opcional)',
    maxlength: 500,
    multilinha: true,
    valor: opcoes.local?.observacoes ?? '',
    // A dica orienta; a mensagem de erro de dado pessoal só aparece
    // quando o texto realmente traz um dado pessoal. Repetir as duas frases
    // deixava a mesma linha escrita duas vezes, uma embaixo da outra.
    dica: 'O que ajuda outro voluntário: movimento, pontos de referência, cuidados do local.',
  });

  const enviar = el('button', {
    tipo: 'submit',
    classe: 'botao botao-largo',
    texto: editando ? 'Salvar alterações' : 'Salvar local',
  });

  const campos = { nome, endereco, melhor_horario: horario, observacoes };

  const form = el(
    'form',
    { novalidate: true },
    nome.bloco,
    tipo.bloco,
    endereco.bloco,
    horario.bloco,
    observacoes.bloco,
    el('div', { classe: 'acoes' },
      el('div', { style: 'flex: 1 1 100%' }, enviar),
      botao('Cancelar', opcoes.aoFechar, { classe: 'botao-sutil' })),
  );

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    for (const c of Object.values(campos)) mostrarErroCampo(c.erro, null);

    const problemas = validarLocal({
      nome: nome.entrada.value,
      endereco: endereco.entrada.value,
      melhor_horario: horario.entrada.value,
      observacoes: observacoes.entrada.value,
    });

    if (problemas.length > 0) {
      for (const problema of problemas) {
        const destino = campos[problema.campo as keyof typeof campos];
        if (destino) mostrarErroCampo(destino.erro, problema.mensagem);
      }
      campos[problemas[0].campo as keyof typeof campos]?.entrada.focus();
      return;
    }

    enviar.disabled = true;
    enviar.textContent = 'Salvando...';

    try {
      if (editando && opcoes.local) {
        const { error } = await supabase.rpc('editar_local', {
          p_id: opcoes.local.id,
          p_nome: nome.entrada.value.trim(),
          p_tipo: tipo.entrada.value as TipoLocal,
          p_endereco: endereco.entrada.value.trim() || null,
          p_melhor_horario: horario.entrada.value.trim() || null,
          p_observacoes: observacoes.entrada.value.trim() || null,
        });
        if (error) throw error;
        avisarSucesso('Local atualizado.');
        opcoes.aoSalvar(opcoes.local.id);
      } else {
        if (!opcoes.posicao) throw new Error('posicao_invalida');
        const { data, error } = await supabase.rpc('marcar_local', {
          p_nome: nome.entrada.value.trim(),
          p_tipo: tipo.entrada.value as TipoLocal,
          p_lat: opcoes.posicao.lat,
          p_lng: opcoes.posicao.lng,
          p_endereco: endereco.entrada.value.trim() || null,
          p_melhor_horario: horario.entrada.value.trim() || null,
          p_observacoes: observacoes.entrada.value.trim() || null,
        });
        if (error) throw error;
        avisarSucesso('Local marcado. Ele já aparece no mapa para todos.');
        opcoes.aoSalvar(data as string);
      }
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
      enviar.disabled = false;
      enviar.textContent = editando ? 'Salvar alterações' : 'Salvar local';
    }
  });

  const limite = opcoes.limite;
  const noLimite = !editando && limite && !limite.sem_limite && (limite.restantes ?? 0) <= 0;

  return el(
    'div',
    {},
    opcoes.posicao
      ? el('div', { classe: 'caixa caixa-icone', style: 'margin-bottom: var(--e4)' },
          icone('local', { tamanho: 18 }),
          el('div', {},
            el('strong', { texto: 'Posição escolhida' }),
            el('p', {
              classe: 'texto-fraco',
              texto: `${opcoes.posicao.lat.toFixed(5)}, ${opcoes.posicao.lng.toFixed(5)}`,
            })))
      : null,
    noLimite
      ? el(
          'div',
          { classe: 'caixa caixa-aviso caixa-icone' },
          icone('mao', { tamanho: 18 }),
          el('div', {},
            el('strong', { texto: `Você chegou ao limite de ${limite.limite} locais por hoje.` }),
            limite.pedido_aberto
              ? el('p', { classe: 'texto-fraco', texto: 'Seu pedido de liberação está aguardando análise de um administrador.' })
              : el('div', { classe: 'acoes' },
                  botao('Pedir liberação do limite', opcoes.aoPedirLimite, { classe: 'botao' }))),
        )
      : null,
    !editando && limite && !limite.sem_limite && (limite.restantes ?? 0) > 0
      ? el('p', { classe: 'texto-fraco', style: 'margin-bottom: var(--e4)',
          texto: `Restam ${limite.restantes} marcações hoje.` })
      : null,
    noLimite ? null : form,
  );
}
