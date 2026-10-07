import { el } from './dom.js';
import { icone, type NomeIcone } from './icones.js';

type Tom = 'neutro' | 'erro' | 'sucesso';

const ICONE_DO_TOM: Record<Tom, NomeIcone> = {
  neutro: 'info',
  erro: 'alerta',
  sucesso: 'check',
};

/** Aviso flutuante de curta duração, anunciado por aria-live. */
export function avisar(mensagem: string, tom: Tom = 'neutro', ms = 5000): void {
  const area = document.getElementById('avisos');
  if (!area) return;

  // Mais de três avisos empilhados viram ruído: o mais antigo sai.
  while (area.childElementCount >= 3) area.firstElementChild?.remove();

  const caixa = el(
    'div',
    { classe: `aviso-flutuante${tom === 'neutro' ? '' : ` ${tom}`}`, 'data-aviso': tom },
    icone(ICONE_DO_TOM[tom]),
    el('span', { texto: mensagem }),
  );

  area.append(caixa);

  window.setTimeout(() => {
    caixa.style.transition = 'opacity 180ms, transform 180ms';
    caixa.style.opacity = '0';
    caixa.style.transform = 'translateY(6px)';
    window.setTimeout(() => caixa.remove(), 200);
  }, ms);
}

export function avisarErro(mensagem: string): void {
  avisar(mensagem, 'erro', 7000);
}

export function avisarSucesso(mensagem: string): void {
  avisar(mensagem, 'sucesso');
}
