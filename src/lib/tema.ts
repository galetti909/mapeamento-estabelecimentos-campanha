import { useSyncExternalStore } from 'react';

// Tema claro ou escuro, seguindo o aparelho. O shadcn usa a classe .dark no
// <html>; ela e posta aqui, sem script inline (a CSP nao permite).

const consulta = window.matchMedia('(prefers-color-scheme: dark)');

function aplicar(): void {
  document.documentElement.classList.toggle('dark', consulta.matches);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', consulta.matches ? '#09090b' : '#ffffff');
}

aplicar();
consulta.addEventListener('change', aplicar);

function assinar(ouvinte: () => void): () => void {
  consulta.addEventListener('change', ouvinte);
  return () => consulta.removeEventListener('change', ouvinte);
}

export function useTemaEscuro(): boolean {
  return useSyncExternalStore(assinar, () => consulta.matches);
}
