// Menu de ações: um botão "Mais ações" que abre uma lista flutuante.
// Existe para que uma linha de lista mostre só as duas ações principais e
// guarde o resto, em vez de empurrar seis botões para fora da tela.

import { el } from './dom.js';
import { icone } from './icones.js';

export interface AcaoMenu {
  rotulo: string;
  aoEscolher: () => void;
  perigo?: boolean;
}

let abertoAgora: (() => void) | null = null;

/** Fecha o menu de ações que estiver aberto. */
export function fecharMenuAcoes(): void {
  abertoAgora?.();
  abertoAgora = null;
}

document.addEventListener('click', (evento) => {
  const alvo = evento.target as HTMLElement | null;
  if (alvo?.closest('.menu-acoes, .menu-acoes-botao')) return;
  fecharMenuAcoes();
});

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') fecharMenuAcoes();
});

export function menuDeAcoes(acoes: AcaoMenu[], rotuloAria = 'Mais ações'): HTMLElement {
  const lista = el('div', { classe: 'menu-acoes', role: 'menu', hidden: true });

  const gatilho = el('button', {
    tipo: 'button',
    classe: 'botao-secundario botao-pequeno menu-acoes-botao',
    rotuloAria,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  });
  gatilho.append(el('span', { texto: 'Mais' }), icone('menu', { tamanho: 16 }));

  for (const acao of acoes) {
    const item = el('button', {
      tipo: 'button',
      role: 'menuitem',
      classe: acao.perigo ? 'perigo' : '',
      texto: acao.rotulo,
    });
    item.addEventListener('click', () => {
      fechar();
      acao.aoEscolher();
    });
    lista.append(item);
  }

  function fechar(): void {
    lista.hidden = true;
    gatilho.setAttribute('aria-expanded', 'false');
    if (abertoAgora === fechar) abertoAgora = null;
  }

  function abrir(): void {
    fecharMenuAcoes();
    lista.hidden = false;
    gatilho.setAttribute('aria-expanded', 'true');
    abertoAgora = fechar;

    // Se não couber para baixo, abre para cima.
    const caixa = lista.getBoundingClientRect();
    lista.classList.toggle('acima', caixa.bottom > window.innerHeight - 8);
    lista.querySelector<HTMLElement>('button')?.focus();
  }

  gatilho.addEventListener('click', () => {
    if (lista.hidden) abrir();
    else fechar();
  });

  return el('div', { classe: 'menu-acoes-raiz' }, gatilho, lista);
}
