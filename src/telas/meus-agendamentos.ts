import { botao, el, substituir } from '../lib/dom.js';
import { avisarErro, avisarSucesso } from '../lib/avisos.js';
import { formatarDiaCurto, formatarHora } from '../lib/datas.js';
import { mensagemDeErro } from '../lib/erros.js';
import { podeEscrever } from '../lib/sessao.js';
import { supabase } from '../lib/supabase.js';
import type { MeuAgendamento } from '../lib/tipos.js';
import { icone } from '../lib/icones.js';

/** Lista dos proprios agendamentos futuros. */
export function telaMeusAgendamentos(aoAbrirLocal: (localId: string) => void): HTMLElement {
  const corpo = el('div');
  const area = el('div', { classe: 'pagina' },
    el('div', { classe: 'pagina-cabecalho' },
      el('h2', { texto: 'Meus agendamentos' }),
      el('p', { classe: 'sub', texto: 'Apenas os seus agendamentos de hoje em diante.' })),
    corpo,
  );

  void carregar();

  async function carregar(): Promise<void> {
    substituir(corpo, el('div', { classe: 'esqueleto' },
      el('div', { classe: 'esqueleto-linha' }),
      el('div', { classe: 'esqueleto-linha' })));

    const { data, error } = await supabase.rpc('meus_agendamentos');
    if (error) {
      substituir(corpo, el('div', { classe: 'caixa caixa-erro' }, el('p', { texto: mensagemDeErro(error) })));
      return;
    }

    const itens = (data as MeuAgendamento[]) ?? [];
    if (itens.length === 0) {
      substituir(corpo, el('div', { classe: 'vazio' },
        icone('calendario', { tamanho: 28 }),
        el('p', { texto: 'Você não tem agendamentos futuros.' }),
        el('p', { classe: 'texto-fraco', texto: 'Abra um local no mapa e use "Me agendar".' })));
      return;
    }

    substituir(
      corpo,
      el('ul', { classe: 'lista' },
        ...itens.map((item) =>
          el('li', {},
            el('div', { classe: 'principal' },
              el('strong', { texto: item.local_nome }),
              el('span', { texto: `${formatarDiaCurto(item.dia)} · ${formatarHora(item.hora_inicio)}–${formatarHora(item.hora_fim)}` }),
              el('div', { classe: 'meta' },
                el('span', { texto: `${item.municipio_nome ?? '—'}${item.uf ? ` (${item.uf})` : ''}` })),
            ),
            el('div', { classe: 'acoes' },
              botao('Ver no mapa', () => aoAbrirLocal(item.local_id), { classe: 'botao-secundario botao-pequeno' }),
              podeEscrever()
                ? botao('Cancelar', () => void cancelar(item.id), { classe: 'botao-sutil botao-pequeno' })
                : null,
            ),
          ),
        ),
      ),
    );
  }

  async function cancelar(id: string): Promise<void> {
    const { error } = await supabase.rpc('cancelar_agendamento', { p_id: id });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso('Agendamento cancelado.');
    void carregar();
  }

  return area;
}
