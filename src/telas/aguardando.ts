import { botao, el } from '../lib/dom.js';
import { icone } from '../lib/icones.js';
import type { StatusConta } from '../lib/tipos.js';

const TEXTOS: Record<string, { titulo: string; corpo: string }> = {
  aguardando: {
    titulo: 'Sua conta está aguardando liberação',
    corpo: 'Um administrador vai analisar o pedido. Enquanto isso, nenhuma outra tela fica disponível. O app não envia e-mails: se quiser, fale com alguém do grupo por fora dele.',
  },
  recusado: {
    titulo: 'Sua conta não está liberada',
    corpo: 'Um administrador analisou o pedido e não liberou a conta. Se achar que houve um engano, fale com alguém do grupo por fora do app.',
  },
  bloqueado: {
    titulo: 'Sua conta não está liberada',
    corpo: 'Um administrador bloqueou esta conta. Se achar que houve um engano, fale com alguém do grupo por fora do app.',
  },
};

/** Tela unica de quem nao tem conta liberada. */
export function telaAguardando(status: StatusConta, email: string | null, aoSair: () => void): HTMLElement {
  const texto = TEXTOS[status] ?? TEXTOS.aguardando;
  const esperando = status === 'aguardando';

  return el(
    'div',
    { classe: 'acesso' },
    el('div', { classe: 'acesso-marca' },
      el('span', {
        classe: 'simbolo',
        style: esperando ? '' : 'background: var(--perigo); color: #fff',
      }, icone(esperando ? 'relogio' : 'cadeado', { tamanho: 24 })),
      el('h2', { texto: texto.titulo }),
    ),
    el('p', { classe: 'sub', texto: texto.corpo }),
    email
      ? el('div', { classe: 'caixa caixa-icone' },
          icone('pessoas', { tamanho: 18 }),
          el('div', {},
            el('p', { classe: 'texto-fraco', texto: 'Conta' }),
            el('p', { texto: email }),
          ),
        )
      : null,
    el('div', { classe: 'acoes' },
      botao('Sair', aoSair, { classe: 'botao-secundario botao-largo' }),
    ),
  );
}
