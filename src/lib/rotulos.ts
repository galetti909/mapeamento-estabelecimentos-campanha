import type { OrigemLocal, Papel, StatusConta, StatusLocal, StatusPedido, TipoLocal } from './tipos.js';

export const ROTULO_TIPO: Record<TipoLocal, string> = {
  feira: 'Feira',
  praca: 'Praça',
  parque: 'Parque',
  mercado: 'Mercado',
  padaria: 'Padaria',
  bar: 'Bar',
  cafe: 'Café',
  restaurante: 'Restaurante',
  comercio: 'Comércio',
  terminal: 'Terminal',
  outro: 'Outro',
};

export const ROTULO_STATUS_LOCAL: Record<StatusLocal, string> = {
  importado: 'Importado',
  ativo: 'Ativo',
  arquivado: 'Arquivado',
};

export const ROTULO_STATUS_CONTA: Record<StatusConta, string> = {
  aguardando: 'Aguardando liberação',
  ativo: 'Liberada',
  recusado: 'Recusada',
  bloqueado: 'Bloqueada',
};

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  voluntario: 'Voluntário',
};

export const ROTULO_ORIGEM: Record<OrigemLocal, string> = {
  osm: 'OpenStreetMap',
  manual: 'Marcado por voluntário',
  dados_abertos: 'Dados abertos',
};

export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  aberto: 'Aberto',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
};

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
] as const;

/**
 * Como cada ação do histórico é escrita para uma pessoa. A chave é o nome da
 * função RPC (ou "insert"/"update", quando a escrita não veio de uma função).
 */
export const ROTULO_ACAO: Record<string, string> = {
  insert: 'Criado',
  update: 'Alterado',
  marcar_local: 'Local marcado',
  ativar_importado: 'Local importado ativado',
  editar_local: 'Local editado',
  arquivar_local: 'Local arquivado',
  restaurar_local: 'Versão restaurada',
  agendar: 'Agendamento criado',
  cancelar_agendamento: 'Agendamento cancelado',
  pedir_liberacao_limite: 'Liberação de limite pedida',
  admin_decidir_pedido: 'Pedido de limite decidido',
  admin_definir_limite: 'Limite da conta alterado',
  admin_definir_status: 'Status da conta alterado',
  admin_definir_papel: 'Papel da conta alterado',
  admin_arquivar_locais_da_conta: 'Locais da conta arquivados',
  admin_somente_leitura: 'Modo somente leitura alterado',
  trocar_minha_senha_concluida: 'Troca de senha concluída',
  criar_admin_inicial: 'Administrador inicial criado',
  importar_osm: 'Importação do OpenStreetMap',
  importar_csv: 'Importação de CSV',
};

/** Nome da tabela como aparece para o administrador. */
export const ROTULO_TABELA: Record<string, string> = {
  perfis: 'conta',
  locais: 'local',
  agendamentos: 'agendamento',
  pedidos_limite: 'pedido de limite',
  config: 'configuração',
  importacao: 'importação',
};
