import { useSyncExternalStore } from 'react';

export type SecaoAdmin = 'contas' | 'pedidos' | 'historico' | 'controle';

export type Rota =
  | { nome: 'mapa'; localId?: string }
  | { nome: 'meus-agendamentos' }
  | { nome: 'regras' }
  | { nome: 'trocar-senha' }
  | { nome: 'admin'; secao: SecaoAdmin };

export function lerRota(hash = location.hash): Rota {
  const bruto = (hash || '#/mapa').replace(/^#\/?/, '');
  const partes = bruto.split('/').filter(Boolean);

  switch (partes[0]) {
    case 'meus-agendamentos':
      return { nome: 'meus-agendamentos' };
    case 'regras':
      return { nome: 'regras' };
    case 'trocar-senha':
      return { nome: 'trocar-senha' };
    case 'admin': {
      const secao = partes[1];
      if (secao === 'pedidos' || secao === 'historico' || secao === 'controle') {
        return { nome: 'admin', secao };
      }
      return { nome: 'admin', secao: 'contas' };
    }
    default:
      return partes[1] ? { nome: 'mapa', localId: partes[1] } : { nome: 'mapa' };
  }
}

function assinar(ouvinte: () => void): () => void {
  window.addEventListener('hashchange', ouvinte);
  return () => window.removeEventListener('hashchange', ouvinte);
}

/** O hash atual; a tela redesenha quando ele muda. */
export function useHash(): string {
  return useSyncExternalStore(assinar, () => location.hash);
}

export function irPara(hash: string): void {
  if (location.hash !== hash) location.hash = hash;
}
