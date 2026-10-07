import { supabase } from './supabase.js';
import type { Config, Perfil } from './tipos.js';

export interface Estado {
  usuarioId: string | null;
  email: string | null;
  perfil: Perfil | null;
  config: Config | null;
}

export const estado: Estado = {
  usuarioId: null,
  email: null,
  perfil: null,
  config: null,
};

export function estaAtivo(): boolean {
  return estado.perfil?.status === 'ativo';
}

export function souAdmin(): boolean {
  return estaAtivo() && estado.perfil?.papel === 'admin';
}

export function podeEscrever(): boolean {
  if (!estaAtivo()) return false;
  if (!estado.config?.somente_leitura) return true;
  return souAdmin();
}

/** Recarrega usuario, perfil e config a partir do banco. */
export async function carregarSessao(): Promise<void> {
  const { data: sessao } = await supabase.auth.getSession();
  const usuario = sessao.session?.user ?? null;

  estado.usuarioId = usuario?.id ?? null;
  estado.email = usuario?.email ?? null;
  estado.perfil = null;
  estado.config = null;

  if (!usuario) return;

  // As duas leituras saem juntas: em rede movel, uma ida a mais ao servidor
  // atrasa a abertura do mapa. A config so e legivel por conta ativa, e nesse
  // caso ela volta vazia, sem erro que precise de tratamento.
  const [respostaPerfil, respostaConfig] = await Promise.all([
    supabase
      .from('perfis')
      .select('id, nome_exibicao, papel, status, sem_limite, trocar_senha, criado_em')
      .eq('id', usuario.id)
      .maybeSingle(),
    supabase.from('config').select('somente_leitura, limite_diario').maybeSingle(),
  ]);

  estado.perfil = (respostaPerfil.data as Perfil | null) ?? null;

  if (estado.perfil?.status === 'ativo') {
    estado.config = (respostaConfig.data as Config | null) ?? null;
  }
}

export async function sair(): Promise<void> {
  await supabase.auth.signOut();
  estado.usuarioId = null;
  estado.email = null;
  estado.perfil = null;
  estado.config = null;
}
