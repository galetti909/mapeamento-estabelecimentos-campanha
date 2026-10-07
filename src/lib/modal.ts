// Diálogo modal.
//
// Existe por um motivo concreto: formulários curtos do administrador (senha
// temporária, arquivamento em massa) eram desenhados dentro da própria lista,
// e qualquer recarga da lista os apagava no meio do preenchimento. Num
// diálogo, o formulário vive fora da lista e sobrevive a ela.

import { botao, el } from './dom.js';
import { icone } from './icones.js';

export interface Modal {
  /** Fecha e devolve o foco a quem abriu. */
  fechar: () => void;
  corpo: HTMLElement;
}

export function abrirModal(titulo: string, conteudo: (modal: Modal) => Node): Modal {
  const anterior = document.activeElement as HTMLElement | null;

  const corpo = el('div', { classe: 'modal-corpo' });

  const fecharBotao = botao('', () => modal.fechar(), {
    classe: 'botao-icone',
    rotuloAria: 'Fechar',
  });
  fecharBotao.append(icone('fechar'));

  const caixa = el(
    'div',
    {
      classe: 'modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': titulo,
    },
    el('div', { classe: 'modal-cabecalho' }, el('h2', { texto: titulo }), fecharBotao),
    corpo,
  );

  const fundo = el('div', { classe: 'modal-fundo' }, caixa);

  const modal: Modal = {
    corpo,
    fechar(): void {
      document.removeEventListener('keydown', aoTeclar);
      fundo.remove();
      anterior?.focus();
    },
  };

  function aoTeclar(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      modal.fechar();
      return;
    }
    if (evento.key !== 'Tab') return;

    // Mantém o foco dentro do diálogo.
    const focaveis = caixa.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];

    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  fundo.addEventListener('mousedown', (evento) => {
    if (evento.target === fundo) modal.fechar();
  });
  document.addEventListener('keydown', aoTeclar);

  corpo.append(conteudo(modal));
  document.body.append(fundo);

  corpo.querySelector<HTMLElement>('input, select, textarea, button')?.focus();

  return modal;
}
