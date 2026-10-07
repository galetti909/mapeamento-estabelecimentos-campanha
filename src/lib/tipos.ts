// Tipos espelhando os enums e as funcoes do banco (supabase/migrations).

export type Papel = 'admin' | 'voluntario';
export type StatusConta = 'aguardando' | 'ativo' | 'recusado' | 'bloqueado';
export type StatusLocal = 'importado' | 'ativo' | 'arquivado';
export type OrigemLocal = 'osm' | 'manual' | 'dados_abertos';
export type StatusPedido = 'aberto' | 'aprovado' | 'recusado';

export const TIPOS_LOCAL = [
  'feira', 'praca', 'parque', 'mercado', 'padaria', 'bar',
  'cafe', 'restaurante', 'comercio', 'terminal', 'outro',
] as const;

export type TipoLocal = (typeof TIPOS_LOCAL)[number];

export interface Perfil {
  id: string;
  nome_exibicao: string;
  papel: Papel;
  status: StatusConta;
  sem_limite: boolean;
  trocar_senha: boolean;
  criado_em: string;
}

export interface MarcadorPonto {
  modo: 'ponto';
  id: string;
  nome: string;
  tipo: TipoLocal;
  status: StatusLocal;
  lat: number;
  lng: number;
  municipio_id: number | null;
  municipio_nome: string | null;
  uf: string | null;
  quantidade: null;
}

export interface MarcadorContagem {
  modo: 'contagem';
  id: null;
  nome: string;
  tipo: null;
  status: null;
  lat: number;
  lng: number;
  municipio_id: number;
  municipio_nome: string;
  uf: string;
  quantidade: number;
}

export type Marcador = MarcadorPonto | MarcadorContagem;

export interface LocalDetalhe {
  id: string;
  nome: string;
  tipo: TipoLocal;
  status: StatusLocal;
  origem: OrigemLocal;
  lat: number;
  lng: number;
  endereco: string | null;
  melhor_horario: string | null;
  observacoes: string | null;
  municipio_nome: string | null;
  uf: string | null;
  motivo_arquivamento: string | null;
  criado_em: string;
  posso_alterar: boolean;
}

export interface ItemAgenda {
  id: string;
  dia: string;
  hora_inicio: string;
  hora_fim: string;
  nome_exibicao: string;
  meu: boolean;
}

export interface MeuAgendamento {
  id: string;
  local_id: string;
  local_nome: string;
  municipio_nome: string | null;
  uf: string | null;
  dia: string;
  hora_inicio: string;
  hora_fim: string;
}

export interface MeuLimite {
  usados: number;
  limite: number;
  sem_limite: boolean;
  restantes: number | null;
  pedido_aberto: boolean;
}

export interface ContaAdmin {
  id: string;
  email: string;
  nome_exibicao: string;
  papel: Papel;
  status: StatusConta;
  sem_limite: boolean;
  trocar_senha: boolean;
  criado_em: string;
  decidido_em: string | null;
  decidido_por_nome: string | null;
  locais_ativos: number;
  marcados_hoje: number;
}

export interface PedidoAdmin {
  id: string;
  perfil_id: string;
  nome_exibicao: string;
  email: string;
  status: StatusPedido;
  criado_em: string;
  locais_total: number;
  marcados_hoje: number;
}

export interface LinhaHistorico {
  id: number;
  tabela: string;
  registro_id: string;
  acao: string;
  feito_por: string | null;
  autor_nome: string;
  feito_em: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}

export interface Config {
  somente_leitura: boolean;
  limite_diario: number;
}

export interface Municipio {
  id: number;
  nome: string;
  uf: string;
}
