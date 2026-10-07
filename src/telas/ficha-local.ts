import { botao, campo, el, mostrarErroCampo, substituir } from '../lib/dom.js';
import { avisarErro, avisarSucesso } from '../lib/avisos.js';
import { formatarDiaCurto, formatarHora } from '../lib/datas.js';
import { mensagemDeErro } from '../lib/erros.js';
import { ROTULO_ORIGEM, ROTULO_STATUS_LOCAL, ROTULO_TIPO } from '../lib/rotulos.js';
import { podeEscrever, souAdmin } from '../lib/sessao.js';
import { supabase } from '../lib/supabase.js';
import type { ItemAgenda, LocalDetalhe, MeuLimite } from '../lib/tipos.js';
import { validarAgendamento, validarMotivoArquivamento } from '../lib/validacao.js';
import { ICONE_DO_TIPO, icone } from '../lib/icones.js';
import { formularioLocal } from './formulario-local.js';
import { hojeBrasilia, somarDias } from '../lib/datas.js';

interface Opcoes {
  localId: string;
  limite: MeuLimite | null;
  aoFechar: () => void;
  /** Recarrega os marcadores do mapa depois de uma mudanca. */
  aoMudar: () => void;
  aoPedirLimite: () => void;
}

/** Painel que sobe da parte de baixo com a ficha completa do local. */
export function fichaLocal(opcoes: Opcoes): HTMLElement {
  const painel = el('div', {
    classe: 'painel',
    role: 'dialog',
    'aria-modal': 'false',
    'aria-label': 'Ficha do local',
  });

  const corpo = el('div', { classe: 'painel-corpo' });

  const fechar = botao('', opcoes.aoFechar, {
    classe: 'botao-icone',
    rotuloAria: 'Fechar ficha do local',
  });
  fechar.append(icone('fechar'));

  const titulo = el('h2', { texto: 'Carregando...' });

  const cabecalho = el('div', { classe: 'painel-cabecalho' }, titulo, fechar);

  painel.append(
    el('div', { classe: 'painel-puxador', 'aria-hidden': 'true' }),
    cabecalho,
    corpo,
  );

  // Em tela de celular o fundo escurecido separa a ficha do mapa; no
  // computador a folha vira painel lateral e o fundo some (ver estilo.css).
  const fundo = el('div', { classe: 'folha-fundo' });
  fundo.addEventListener('click', opcoes.aoFechar);

  const raiz = el('div', {}, fundo, painel);

  void carregar();

  async function carregar(): Promise<void> {
    substituir(corpo, el('p', { classe: 'texto-fraco', texto: 'Carregando a ficha...' }));

    const [detalhe, agenda] = await Promise.all([
      supabase.rpc('local_detalhe', { p_id: opcoes.localId }),
      supabase.rpc('agenda_do_local', { p_local_id: opcoes.localId }),
    ]);

    if (detalhe.error) {
      avisarErro(mensagemDeErro(detalhe.error));
      opcoes.aoFechar();
      return;
    }

    const local = (detalhe.data as LocalDetalhe[])[0];
    if (!local) {
      avisarErro('Local não encontrado.');
      opcoes.aoFechar();
      return;
    }

    const itens = (agenda.error ? [] : (agenda.data as ItemAgenda[])) ?? [];
    desenhar(local, itens);
  }

  function desenhar(local: LocalDetalhe, agenda: ItemAgenda[]): void {
    titulo.textContent = local.nome;

    substituir(
      corpo,
      el('div', { classe: 'etiquetas' },
        el('span', { classe: `etiqueta ${local.status}`, texto: ROTULO_STATUS_LOCAL[local.status] }),
        el('span', { classe: 'etiqueta' },
          icone(ICONE_DO_TIPO[local.tipo], { tamanho: 13 }),
          el('span', { texto: ROTULO_TIPO[local.tipo] })),
      ),

      local.status === 'arquivado' && local.motivo_arquivamento
        ? el('div', { classe: 'caixa caixa-erro caixa-icone', style: 'margin-top: var(--e4)' },
            icone('caixa', { tamanho: 18 }),
            el('div', {},
              el('strong', { texto: 'Local arquivado' }),
              el('p', { texto: local.motivo_arquivamento })))
        : null,

      el('dl', { classe: 'ficha-dados' },
        el('dt', { texto: 'Município' }),
        el('dd', { texto: `${local.municipio_nome ?? '—'}${local.uf ? ` (${local.uf})` : ''}` }),
        local.endereco ? el('dt', { texto: 'Endereço' }) : null,
        local.endereco ? el('dd', { texto: local.endereco }) : null,
        local.melhor_horario ? el('dt', { texto: 'Horário' }) : null,
        local.melhor_horario ? el('dd', { texto: local.melhor_horario }) : null,
        local.observacoes ? el('dt', { texto: 'Observações' }) : null,
        local.observacoes ? el('dd', { texto: local.observacoes }) : null,
        el('dt', { texto: 'Origem' }),
        el('dd', { texto: ROTULO_ORIGEM[local.origem] }),
      ),

      blocoAgenda(local, agenda),
      blocoAcoes(local),
    );
  }

  function blocoAgenda(local: LocalDetalhe, agenda: ItemAgenda[]): HTMLElement {
    const lista = agenda.length === 0
      ? el('div', { classe: 'vazio' },
          icone('calendario', { tamanho: 26 }),
          el('p', { texto: 'Ninguém se agendou para este local ainda.' }))
      : el('ul', { classe: 'lista' },
          ...agenda.map((item) =>
            el('li', {},
              el('div', { classe: 'principal' },
                el('strong', { texto: `${formatarDiaCurto(item.dia)} · ${formatarHora(item.hora_inicio)}–${formatarHora(item.hora_fim)}` }),
                el('span', { texto: item.nome_exibicao }),
              ),
              item.meu || souAdmin()
                ? el('div', { classe: 'acoes' },
                    botao('Cancelar', () => void cancelar(item.id),
                      { classe: 'botao-secundario botao-pequeno' }))
                : null,
            ),
          ),
        );

    const podeAgendar = local.status === 'ativo' && podeEscrever();
    const agendar = botao('', () => abrirAgendamento(local), { classe: 'botao botao-largo' });
    agendar.append(icone('calendario', { tamanho: 18 }), el('span', { texto: 'Me agendar' }));

    return el('div', { classe: 'secao' },
      el('div', { classe: 'secao-titulo' },
        el('h3', { texto: `Agenda${agenda.length > 0 ? ` (${agenda.length})` : ''}` })),
      lista,
      podeAgendar ? el('div', { classe: 'acoes' }, agendar) : null,
    );
  }

  function blocoAcoes(local: LocalDetalhe): HTMLElement | null {
    if (!podeEscrever()) {
      return el('div', { classe: 'caixa caixa-aviso caixa-icone', style: 'margin-top: var(--e6)' },
        icone('cadeado', { tamanho: 18 }),
        el('p', { texto: 'O mapa está somente para leitura neste momento.' }));
    }

    const acoes: HTMLElement[] = [];

    if (local.status === 'importado') {
      const ativar = botao('', () => void ativarLocal(local), { classe: 'botao botao-largo' });
      ativar.append(icone('check', { tamanho: 18 }), el('span', { texto: 'Ativar este local' }));
      acoes.push(ativar);
    }
    if (local.posso_alterar && local.status !== 'arquivado') {
      const editar = botao('', () => abrirEdicao(local), { classe: 'botao-secundario' });
      editar.append(icone('lapis', { tamanho: 16 }), el('span', { texto: 'Editar' }));
      const arquivar = botao('', () => abrirArquivamento(local), { classe: 'botao-perigo' });
      arquivar.append(icone('caixa', { tamanho: 16 }), el('span', { texto: 'Arquivar' }));
      acoes.push(editar, arquivar);
    }
    if (acoes.length === 0) return null;

    return el('div', { classe: 'secao' },
      el('div', { classe: 'secao-titulo' }, el('h3', { texto: 'Ações' })),
      el('div', { classe: 'acoes' }, ...acoes),
    );
  }

  // ---------------------------------------------------------------- acoes
  async function ativarLocal(local: LocalDetalhe): Promise<void> {
    const { error } = await supabase.rpc('ativar_importado', { p_id: local.id });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso('Local ativado. Agora ele aparece na camada de locais ativos.');
    opcoes.aoMudar();
    void carregar();
  }

  async function cancelar(agendamentoId: string): Promise<void> {
    const { error } = await supabase.rpc('cancelar_agendamento', { p_id: agendamentoId });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso('Agendamento cancelado.');
    opcoes.aoMudar();
    void carregar();
  }

  function abrirEdicao(local: LocalDetalhe): void {
    substituir(
      corpo,
      el('div', { classe: 'secao-titulo' }, el('h3', { texto: 'Editar local' })),
      formularioLocal({
        local,
        limite: opcoes.limite,
        aoSalvar: () => {
          opcoes.aoMudar();
          void carregar();
        },
        aoFechar: () => void carregar(),
        aoPedirLimite: opcoes.aoPedirLimite,
      }),
    );
  }

  function abrirArquivamento(local: LocalDetalhe): void {
    const motivo = campo({
      id: 'arquivar-motivo',
      rotulo: 'Motivo do arquivamento',
      maxlength: 300,
      obrigatorio: true,
      dica: 'De 3 a 300 caracteres. O arquivamento cancela os agendamentos futuros deste local.',
    });

    const confirmar = el('button', { tipo: 'submit', classe: 'botao-perigo', texto: 'Arquivar local' });

    const form = el('form', { novalidate: true }, motivo.bloco,
      el('div', { classe: 'acoes' }, confirmar, botao('Voltar', () => void carregar(), { classe: 'botao-secundario' })));

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mostrarErroCampo(motivo.erro, null);
      const problemas = validarMotivoArquivamento(motivo.entrada.value);
      if (problemas.length > 0) {
        mostrarErroCampo(motivo.erro, problemas[0].mensagem);
        motivo.entrada.focus();
        return;
      }
      confirmar.disabled = true;
      const { error } = await supabase.rpc('arquivar_local', {
        p_id: local.id,
        p_motivo: motivo.entrada.value.trim(),
      });
      if (error) {
        avisarErro(mensagemDeErro(error));
        confirmar.disabled = false;
        return;
      }
      avisarSucesso('Local arquivado. Nada foi apagado: um administrador pode restaurar.');
      opcoes.aoMudar();
      void carregar();
    });

    substituir(corpo, el('div', { classe: 'secao-titulo' }, el('h3', { texto: 'Arquivar local' })), form);
  }

  function abrirAgendamento(local: LocalDetalhe): void {
    const hoje = hojeBrasilia();
    const dia = campo({
      id: 'agendar-dia',
      rotulo: 'Dia',
      tipo: 'date',
      obrigatorio: true,
      valor: hoje,
      min: hoje,
      max: somarDias(hoje, 60),
      dica: 'De hoje até 60 dias à frente.',
    });
    const inicio = campo({ id: 'agendar-inicio', rotulo: 'Das', tipo: 'time', obrigatorio: true, valor: '09:00' });
    const fim = campo({ id: 'agendar-fim', rotulo: 'Às', tipo: 'time', obrigatorio: true, valor: '11:00' });

    const confirmar = el('button', { tipo: 'submit', classe: 'botao', texto: 'Confirmar agendamento' });

    const form = el(
      'form',
      { novalidate: true },
      dia.bloco,
      el('div', { classe: 'linha-campos' }, inicio.bloco, fim.bloco),
      el('div', { classe: 'acoes' }, confirmar, botao('Voltar', () => void carregar(), { classe: 'botao-secundario' })),
    );

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      for (const c of [dia, inicio, fim]) mostrarErroCampo(c.erro, null);

      const problemas = validarAgendamento(dia.entrada.value, inicio.entrada.value, fim.entrada.value, hoje);
      if (problemas.length > 0) {
        for (const problema of problemas) {
          mostrarErroCampo(problema.campo === 'dia' ? dia.erro : fim.erro, problema.mensagem);
        }
        return;
      }

      confirmar.disabled = true;
      const { error } = await supabase.rpc('agendar', {
        p_local_id: local.id,
        p_dia: dia.entrada.value,
        p_hora_inicio: inicio.entrada.value,
        p_hora_fim: fim.entrada.value,
      });
      if (error) {
        avisarErro(mensagemDeErro(error));
        confirmar.disabled = false;
        return;
      }
      avisarSucesso('Agendamento confirmado.');
      opcoes.aoMudar();
      void carregar();
    });

    substituir(corpo, el('div', { classe: 'secao-titulo' }, el('h3', { texto: 'Me agendar' })), form);
  }

  return raiz;
}
