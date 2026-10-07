// Validacoes do front-end. Espelham, campo por campo, os CHECK e as funcoes
// do banco (supabase/migrations/20261006000200_dados_pessoais.sql e
// 20261006000300_tabelas.sql). Servem para avisar antes do envio; a decisao
// final e sempre do banco.

/** Padroes de telefone brasileiro, CPF e e-mail bloqueados nos textos. */
const PADROES_DADO_PESSOAL: RegExp[] = [
  // e-mail
  /[a-z0-9._%+-]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i,
  // CPF formatado: 000.000.000-00
  /[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}/,
  // sequencia isolada de 10 ou 11 digitos (DDD + telefone, ou CPF sem pontos)
  /(?:^|[^0-9])[0-9]{10,11}(?:[^0-9]|$)/,
  // telefone com DDD entre parenteses: (11) 91234-5678
  /\(\s*[0-9]{2}\s*\)\s*9?[0-9]{4}[-. ]?[0-9]{4}/,
  // telefone com hifen: 91234-5678 ou 1234-5678
  /(?:^|[^0-9])9?[0-9]{4}-[0-9]{4}(?:[^0-9]|$)/,
  // prefixo internacional do Brasil seguido de telefone
  /\+\s*55\s*\(?\s*[0-9]{2}/,
];

export const AVISO_DADO_PESSOAL = 'Não registre telefone, CPF ou e-mail de pessoas.';

export function contemDadoPessoal(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return PADROES_DADO_PESSOAL.some((padrao) => padrao.test(texto));
}

export interface Problema {
  campo: string;
  mensagem: string;
}

function tamanho(texto: string): number {
  // char_length do Postgres conta pontos de codigo, nao unidades UTF-16.
  return [...texto].length;
}

export function validarNomeExibicao(valor: string): Problema[] {
  const nome = valor.trim();
  const problemas: Problema[] = [];
  if (tamanho(nome) < 2 || tamanho(nome) > 40) {
    problemas.push({ campo: 'nome_exibicao', mensagem: 'O nome de exibição precisa ter de 2 a 40 caracteres.' });
  }
  if (contemDadoPessoal(nome)) {
    problemas.push({ campo: 'nome_exibicao', mensagem: AVISO_DADO_PESSOAL });
  }
  return problemas;
}

export function validarSenha(senha: string, confirmacao?: string): Problema[] {
  const problemas: Problema[] = [];
  if (senha.length < 10) {
    problemas.push({ campo: 'senha', mensagem: 'A senha precisa ter pelo menos 10 caracteres.' });
  }
  if (confirmacao !== undefined && senha !== confirmacao) {
    problemas.push({ campo: 'confirmacao', mensagem: 'As duas senhas não são iguais.' });
  }
  return problemas;
}

export function validarEmail(valor: string): Problema[] {
  const email = valor.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return [{ campo: 'email', mensagem: 'Informe um e-mail válido.' }];
  }
  return [];
}

export interface CamposLocal {
  nome: string;
  endereco?: string;
  melhor_horario?: string;
  observacoes?: string;
}

const LIMITES_LOCAL: Array<{ campo: keyof CamposLocal; rotulo: string; min: number; max: number }> = [
  { campo: 'nome', rotulo: 'nome', min: 2, max: 80 },
  { campo: 'endereco', rotulo: 'endereço', min: 0, max: 160 },
  { campo: 'melhor_horario', rotulo: 'melhor horário', min: 0, max: 80 },
  { campo: 'observacoes', rotulo: 'observações', min: 0, max: 500 },
];

export function validarLocal(campos: CamposLocal): Problema[] {
  const problemas: Problema[] = [];

  for (const limite of LIMITES_LOCAL) {
    const bruto = campos[limite.campo];
    const valor = (bruto ?? '').trim();
    if (valor === '' && limite.min === 0) continue;
    if (tamanho(valor) < limite.min || tamanho(valor) > limite.max) {
      problemas.push({
        campo: limite.campo,
        mensagem: limite.min > 0
          ? `O ${limite.rotulo} precisa ter de ${limite.min} a ${limite.max} caracteres.`
          : `O ${limite.rotulo} aceita no máximo ${limite.max} caracteres.`,
      });
      continue;
    }
    if (contemDadoPessoal(valor)) {
      problemas.push({ campo: limite.campo, mensagem: AVISO_DADO_PESSOAL });
    }
  }

  return problemas;
}

export function validarMotivoArquivamento(valor: string): Problema[] {
  const motivo = valor.trim();
  if (tamanho(motivo) < 3 || tamanho(motivo) > 300) {
    return [{ campo: 'motivo', mensagem: 'Escreva o motivo do arquivamento (3 a 300 caracteres).' }];
  }
  return [];
}

export const DIAS_MAXIMOS_AGENDAMENTO = 60;

export function validarAgendamento(
  dia: string,
  horaInicio: string,
  horaFim: string,
  hoje: string,
): Problema[] {
  const problemas: Problema[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    problemas.push({ campo: 'dia', mensagem: 'Escolha um dia.' });
  } else {
    const limite = new Date(`${hoje}T12:00:00Z`);
    limite.setUTCDate(limite.getUTCDate() + DIAS_MAXIMOS_AGENDAMENTO);
    const limiteISO = limite.toISOString().slice(0, 10);
    if (dia < hoje || dia > limiteISO) {
      problemas.push({
        campo: 'dia',
        mensagem: `Escolha um dia de hoje até ${DIAS_MAXIMOS_AGENDAMENTO} dias à frente.`,
      });
    }
  }

  if (!horaInicio || !horaFim) {
    problemas.push({ campo: 'hora', mensagem: 'Informe o horário de início e de fim.' });
  } else if (horaFim <= horaInicio) {
    problemas.push({ campo: 'hora', mensagem: 'A hora de fim precisa ser maior que a de início.' });
  }

  return problemas;
}
