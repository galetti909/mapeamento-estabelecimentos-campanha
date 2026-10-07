// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { campo, el, limpar, selecao, substituir } from '../../src/lib/dom.js';
import { escreverCsvCliente } from '../../src/lib/exportacao.js';

describe('el: nenhum dado do usuario entra por innerHTML', () => {
  it('escreve texto com textContent', () => {
    const node = el('p', { texto: 'Feira da Sé' });
    expect(node.textContent).toBe('Feira da Sé');
  });

  it('um nome com <script> aparece como texto, nao como elemento', () => {
    const node = el('h2', { texto: '<script>alert(1)</script>' });
    expect(node.textContent).toBe('<script>alert(1)</script>');
    expect(node.querySelector('script')).toBeNull();
    expect(node.children).toHaveLength(0);
  });

  it('um nome com <img onerror> nao cria elemento nenhum', () => {
    const node = el('span', { texto: '<img src=x onerror="alert(1)">' });
    expect(node.querySelector('img')).toBeNull();
    expect(node.textContent).toContain('onerror');
  });

  it('filho em texto puro tambem e escapado', () => {
    const node = el('div', {}, '<b>negrito</b>');
    expect(node.querySelector('b')).toBeNull();
    expect(node.textContent).toBe('<b>negrito</b>');
  });

  it('traduz os atributos abreviados', () => {
    const node = el('input', { classe: 'x', tipo: 'email', nome: 'e', rotuloAria: 'E-mail' });
    expect(node.getAttribute('class')).toBe('x');
    expect(node.getAttribute('type')).toBe('email');
    expect(node.getAttribute('name')).toBe('e');
    expect(node.getAttribute('aria-label')).toBe('E-mail');
  });

  it('atributo booleano entra sem valor', () => {
    expect(el('p', { hidden: true }).hasAttribute('hidden')).toBe(true);
    expect(el('p', { hidden: false }).hasAttribute('hidden')).toBe(false);
  });

  it('ignora filhos nulos e falsos', () => {
    const node = el('div', {}, null, undefined, false, el('span', { texto: 'ok' }));
    expect(node.children).toHaveLength(1);
  });
});

describe('limpar e substituir', () => {
  it('limpar remove todos os filhos', () => {
    const node = el('div', {}, el('span', {}), el('span', {}));
    limpar(node);
    expect(node.childNodes).toHaveLength(0);
  });

  it('substituir troca o conteudo', () => {
    const node = el('div', {}, el('span', { texto: 'antigo' }));
    substituir(node, el('p', { texto: 'novo' }));
    expect(node.textContent).toBe('novo');
    expect(node.children).toHaveLength(1);
  });

  it('substituir com texto do usuario nao interpreta HTML', () => {
    const node = el('div', {});
    substituir(node, '<script>alert(1)</script>');
    expect(node.querySelector('script')).toBeNull();
  });
});

describe('campo: acessibilidade', () => {
  it('associa o rotulo ao campo', () => {
    const { bloco, entrada } = campo({ id: 'teste', rotulo: 'Nome do local' });
    const label = bloco.querySelector('label');
    expect(label?.getAttribute('for')).toBe('teste');
    expect(entrada.id).toBe('teste');
  });

  it('a mensagem de erro tem role=alert e comeca escondida', () => {
    const { erro } = campo({ id: 'teste', rotulo: 'Nome' });
    expect(erro.getAttribute('role')).toBe('alert');
    expect(erro.hidden).toBe(true);
  });

  it('liga a dica ao campo com aria-describedby', () => {
    const { entrada } = campo({ id: 'teste', rotulo: 'Nome', dica: 'De 2 a 80 caracteres.' });
    expect(entrada.getAttribute('aria-describedby')).toBe('teste-dica');
  });

  it('respeita maxlength e obrigatorio', () => {
    const { entrada } = campo({ id: 'teste', rotulo: 'Nome', maxlength: 80, obrigatorio: true });
    expect(entrada.getAttribute('maxlength')).toBe('80');
    expect(entrada.required).toBe(true);
  });

  it('multilinha gera textarea', () => {
    const { entrada } = campo({ id: 'obs', rotulo: 'Observações', multilinha: true });
    expect(entrada.tagName).toBe('TEXTAREA');
  });
});

describe('selecao', () => {
  it('monta as opcoes com textContent', () => {
    const { entrada } = selecao({
      id: 'tipo',
      rotulo: 'Tipo',
      itens: [{ valor: 'feira', texto: '<b>Feira</b>' }],
    });
    expect(entrada.options[0].textContent).toBe('<b>Feira</b>');
    expect(entrada.querySelector('b')).toBeNull();
  });

  it('inclui a opcao vazia quando pedida', () => {
    const { entrada } = selecao({ id: 'uf', rotulo: 'UF', itens: [{ valor: 'SP', texto: 'SP' }], vazio: 'Todas' });
    expect(entrada.options).toHaveLength(2);
    expect(entrada.options[0].value).toBe('');
  });
});

describe('escreverCsvCliente', () => {
  it('escreve cabecalho e escapa os valores', () => {
    expect(escreverCsvCliente([{ nome: 'Bar "do Ze", esquina', uf: 'SP' }]))
      .toBe('nome,uf\n"Bar ""do Ze"", esquina",SP\n');
  });

  it('devolve texto vazio sem linhas', () => {
    expect(escreverCsvCliente([])).toBe('');
  });
});
