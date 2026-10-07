// Criacao de elementos sem nunca usar innerHTML com dado do usuario.
// Todo texto entra por textContent, o que neutraliza qualquer HTML colado
// nos campos (um local chamado "<script>" aparece como texto).

type Filho = Node | string | null | undefined | false;

interface Atributos {
  classe?: string;
  texto?: string;
  tipo?: string;
  id?: string;
  nome?: string;
  valor?: string;
  rotuloAria?: string;
  [chave: string]: string | boolean | number | undefined;
}

const PROPRIEDADES: Record<string, string> = {
  classe: 'class',
  tipo: 'type',
  nome: 'name',
  valor: 'value',
  rotuloAria: 'aria-label',
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Atributos = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === false || valor === null) continue;
    if (chave === 'texto') {
      node.textContent = String(valor);
      continue;
    }
    const atributo = PROPRIEDADES[chave] ?? chave;
    if (valor === true) {
      node.setAttribute(atributo, '');
    } else {
      node.setAttribute(atributo, String(valor));
    }
  }

  for (const filho of filhos) {
    if (filho === null || filho === undefined || filho === false) continue;
    node.append(typeof filho === 'string' ? document.createTextNode(filho) : filho);
  }

  return node;
}

export function limpar(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function substituir(node: Element, ...filhos: Filho[]): void {
  limpar(node);
  for (const filho of filhos) {
    if (filho === null || filho === undefined || filho === false) continue;
    node.append(typeof filho === 'string' ? document.createTextNode(filho) : filho);
  }
}

/** Campo de formulario com rotulo associado (acessibilidade). */
export function campo(opcoes: {
  id: string;
  rotulo: string;
  tipo?: string;
  valor?: string;
  obrigatorio?: boolean;
  maxlength?: number;
  minlength?: number;
  dica?: string;
  autocomplete?: string;
  min?: string;
  max?: string;
  multilinha?: boolean;
}): { bloco: HTMLElement; entrada: HTMLInputElement | HTMLTextAreaElement; erro: HTMLElement } {
  const erro = el('p', { classe: 'campo-erro', role: 'alert', hidden: true });

  const entrada = opcoes.multilinha
    ? el('textarea', {
        id: opcoes.id,
        nome: opcoes.id,
        rows: 3,
        maxlength: opcoes.maxlength,
        'aria-describedby': opcoes.dica ? `${opcoes.id}-dica` : undefined,
      })
    : el('input', {
        id: opcoes.id,
        nome: opcoes.id,
        tipo: opcoes.tipo ?? 'text',
        maxlength: opcoes.maxlength,
        minlength: opcoes.minlength,
        autocomplete: opcoes.autocomplete,
        min: opcoes.min,
        max: opcoes.max,
        'aria-describedby': opcoes.dica ? `${opcoes.id}-dica` : undefined,
      });

  if (opcoes.obrigatorio) entrada.required = true;
  if (opcoes.valor !== undefined) entrada.value = opcoes.valor;

  const bloco = el(
    'div',
    { classe: 'campo' },
    el('label', { for: opcoes.id, texto: opcoes.rotulo }),
    entrada,
    opcoes.dica ? el('p', { id: `${opcoes.id}-dica`, classe: 'campo-dica', texto: opcoes.dica }) : null,
    erro,
  );

  return { bloco, entrada, erro };
}

export function selecao(opcoes: {
  id: string;
  rotulo: string;
  itens: Array<{ valor: string; texto: string }>;
  valor?: string;
  vazio?: string;
}): { bloco: HTMLElement; entrada: HTMLSelectElement } {
  const entrada = el('select', { id: opcoes.id, nome: opcoes.id });

  if (opcoes.vazio !== undefined) {
    entrada.append(el('option', { valor: '', texto: opcoes.vazio }));
  }
  for (const item of opcoes.itens) {
    entrada.append(el('option', { valor: item.valor, texto: item.texto }));
  }
  if (opcoes.valor !== undefined) entrada.value = opcoes.valor;

  const bloco = el(
    'div',
    { classe: 'campo' },
    el('label', { for: opcoes.id, texto: opcoes.rotulo }),
    entrada,
  );

  return { bloco, entrada };
}

export function botao(
  texto: string,
  aoClicar: () => void,
  opcoes: { classe?: string; tipo?: string; rotuloAria?: string } = {},
): HTMLButtonElement {
  const b = el('button', {
    tipo: opcoes.tipo ?? 'button',
    classe: opcoes.classe ?? 'botao',
    texto,
    rotuloAria: opcoes.rotuloAria,
  });
  b.addEventListener('click', aoClicar);
  return b;
}

export function mostrarErroCampo(erro: HTMLElement, mensagem: string | null): void {
  if (mensagem) {
    erro.textContent = mensagem;
    erro.hidden = false;
  } else {
    erro.textContent = '';
    erro.hidden = true;
  }
}
