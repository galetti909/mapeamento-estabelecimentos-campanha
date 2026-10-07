// Traducao dos codigos de erro lancados pelas funcoes do banco para
// mensagens em portugues. Os codigos sao os textos passados em
// "raise exception" nas migrations.

const MENSAGENS: Record<string, string> = {
  sem_login: 'Entre na sua conta para continuar.',
  conta_nao_ativa: 'Sua conta não está liberada por um administrador.',
  somente_admin: 'Esta ação é restrita a administradores.',
  somente_leitura: 'O mapa está temporariamente somente para leitura.',
  limite_diario_atingido: 'Você chegou ao limite de locais por hoje.',
  posicao_invalida: 'Toque no mapa para posicionar o local.',
  ponto_fora_do_brasil: 'Marque um ponto dentro do território brasileiro.',
  local_nao_encontrado: 'Local não encontrado.',
  local_nao_importado: 'Este local já foi ativado ou arquivado.',
  local_nao_ativo: 'Só é possível se agendar em locais ativos.',
  local_ja_arquivado: 'Este local já está arquivado.',
  sem_permissao: 'Você só altera os locais que marcou ou ativou.',
  motivo_obrigatorio: 'Escreva o motivo do arquivamento (3 a 300 caracteres).',
  versao_nao_encontrada: 'Essa linha do histórico não guarda uma versão deste local.',
  dia_fora_da_janela: 'Escolha um dia de hoje até 60 dias à frente.',
  horario_invalido: 'A hora de fim precisa ser maior que a de início.',
  agendamento_sobreposto: 'Você já tem um agendamento nesse horário neste local.',
  agendamento_nao_encontrado: 'Agendamento não encontrado.',
  agendamento_ja_cancelado: 'Este agendamento já foi cancelado.',
  sem_limite_ja_liberado: 'Sua conta já está sem limite diário.',
  pedido_ja_aberto: 'Você já tem um pedido aguardando análise.',
  pedido_nao_encontrado: 'Pedido não encontrado.',
  pedido_nao_aberto: 'Este pedido já foi decidido.',
  perfil_nao_encontrado: 'Conta não encontrada.',
  nao_pode_agir_sobre_si: 'Um administrador não altera a própria conta.',
  ultimo_admin: 'Promova outro administrador antes de retirar este.',
  historico_imutavel: 'O histórico só aceita inserções.',
  nome_exibicao_obrigatorio: 'Informe um nome de exibição de 2 a 40 caracteres.',
  nome_exibicao_tamanho: 'O nome de exibição precisa ter de 2 a 40 caracteres.',
  nome_exibicao_em_uso: 'Esse nome de exibição já está em uso. Escolha outro.',
  locais_nome_sem_dado_pessoal: 'Não registre telefone, CPF ou e-mail de pessoas.',
  locais_endereco_sem_dado_pessoal: 'Não registre telefone, CPF ou e-mail de pessoas.',
  locais_horario_sem_dado_pessoal: 'Não registre telefone, CPF ou e-mail de pessoas.',
  locais_obs_sem_dado_pessoal: 'Não registre telefone, CPF ou e-mail de pessoas.',
  perfis_nome_sem_dado_pessoal: 'Não registre telefone, CPF ou e-mail de pessoas.',
  perfis_nome_exibicao_unico: 'Esse nome de exibição já está em uso. Escolha outro.',
  locais_nome_tamanho: 'O nome precisa ter de 2 a 80 caracteres.',
  agendamentos_sem_sobreposicao: 'Você já tem um agendamento nesse horário neste local.',
};

const MENSAGENS_AUTH: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  user_already_exists: 'Já existe uma conta com esse e-mail.',
  email_exists: 'Já existe uma conta com esse e-mail.',
  weak_password: 'A senha precisa ter pelo menos 10 caracteres.',
  over_request_rate_limit: 'Muitas tentativas. Espere um pouco e tente de novo.',
  over_email_send_rate_limit: 'Muitas tentativas. Espere um pouco e tente de novo.',
  signup_disabled: 'As inscrições estão fechadas no momento.',
  same_password: 'A nova senha precisa ser diferente da atual.',
};

/** Procura um codigo conhecido em qualquer parte do texto do erro. */
function codigoConhecido(texto: string): string | null {
  for (const codigo of Object.keys(MENSAGENS)) {
    if (texto.includes(codigo)) return codigo;
  }
  return null;
}

export function mensagemDeErro(erro: unknown): string {
  if (!erro) return 'Não foi possível concluir. Tente de novo.';

  const bruto = erro as { code?: string; message?: string; details?: string; hint?: string; error_code?: string };
  const code = bruto.error_code ?? bruto.code ?? '';

  if (code && MENSAGENS_AUTH[code]) return MENSAGENS_AUTH[code];
  if (code && MENSAGENS[code]) return MENSAGENS[code];

  const texto = [bruto.message, bruto.details, bruto.hint].filter(Boolean).join(' ');

  const codigo = codigoConhecido(texto);
  if (codigo) return MENSAGENS[codigo];

  for (const [chave, mensagem] of Object.entries(MENSAGENS_AUTH)) {
    if (texto.toLowerCase().includes(chave.replace(/_/g, ' '))) return mensagem;
  }

  if (/duplicate key value/i.test(texto) && /nome_exibicao/i.test(texto)) {
    return MENSAGENS.nome_exibicao_em_uso;
  }
  if (/Failed to fetch|NetworkError|network/i.test(texto)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }

  return bruto.message || 'Não foi possível concluir. Tente de novo.';
}
