// Leitura e escrita de CSV (RFC 4180) sem dependencia externa.

export function lerCsv(texto: string): Array<Record<string, string>> {
  const linhas = dividirLinhas(texto.replace(/^﻿/, ''));
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0].map((c) => c.trim());
  const registros: Array<Record<string, string>> = [];

  for (const linha of linhas.slice(1)) {
    if (linha.length === 1 && linha[0].trim() === '') continue;
    const registro: Record<string, string> = {};
    cabecalho.forEach((coluna, i) => {
      registro[coluna] = (linha[i] ?? '').trim();
    });
    registros.push(registro);
  }

  return registros;
}

function dividirLinhas(texto: string): string[][] {
  const linhas: string[][] = [];
  let campos: string[] = [];
  let atual = '';
  let entreAspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];

    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          entreAspas = false;
        }
      } else {
        atual += c;
      }
      continue;
    }

    if (c === '"') {
      entreAspas = true;
    } else if (c === ',' || c === ';') {
      campos.push(atual);
      atual = '';
    } else if (c === '\n') {
      campos.push(atual);
      linhas.push(campos);
      campos = [];
      atual = '';
    } else if (c !== '\r') {
      atual += c;
    }
  }

  if (atual !== '' || campos.length > 0) {
    campos.push(atual);
    linhas.push(campos);
  }

  return linhas;
}

function escaparCampo(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  if (/[",\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function escreverCsv(registros: Array<Record<string, unknown>>, colunas?: string[]): string {
  const cabecalho = colunas ?? (registros.length > 0 ? Object.keys(registros[0]) : []);
  const linhas = [cabecalho.join(',')];
  for (const registro of registros) {
    linhas.push(cabecalho.map((coluna) => escaparCampo(registro[coluna])).join(','));
  }
  return `${linhas.join('\n')}\n`;
}
