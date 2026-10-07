// Exportacao em CSV feita no navegador (botao "Exportar base" do
// administrador). O backup diario completo e feito por scripts/exportar.ts,
// que roda com a chave de servico.

export function escreverCsvCliente(linhas: Array<Record<string, unknown>>): string {
  if (linhas.length === 0) return '';

  const colunas = Object.keys(linhas[0]);
  const escapar = (valor: unknown): string => {
    if (valor === null || valor === undefined) return '';
    const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  return [
    colunas.join(','),
    ...linhas.map((linha) => colunas.map((coluna) => escapar(linha[coluna])).join(',')),
  ].join('\n') + '\n';
}

export function baixarArquivo(nome: string, conteudo: string): void {
  const blob = new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
