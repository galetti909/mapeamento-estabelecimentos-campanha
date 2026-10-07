import { describe, expect, it } from 'vitest';
import { mensagemDeErro } from '../../src/lib/erros.js';

describe('mensagemDeErro', () => {
  it('traduz o codigo lancado pelo banco na mensagem', () => {
    expect(mensagemDeErro({ message: 'limite_diario_atingido' }))
      .toBe('Você chegou ao limite de locais por hoje.');
  });

  it('traduz o codigo quando vem embrulhado pelo PostgREST', () => {
    expect(mensagemDeErro({
      code: 'P0001',
      message: 'conta_nao_ativa',
      hint: 'Sua conta nao esta liberada por um administrador.',
    })).toBe('Sua conta não está liberada por um administrador.');
  });

  it('traduz violacao de CHECK de dado pessoal', () => {
    expect(mensagemDeErro({
      code: '23514',
      message: 'new row for relation "locais" violates check constraint "locais_obs_sem_dado_pessoal"',
    })).toBe('Não registre telefone, CPF ou e-mail de pessoas.');
  });

  it('traduz nome de exibicao repetido', () => {
    expect(mensagemDeErro({ message: 'nome_exibicao_em_uso' }))
      .toBe('Esse nome de exibição já está em uso. Escolha outro.');
    expect(mensagemDeErro({
      code: '23505',
      message: 'duplicate key value violates unique constraint "perfis_nome_exibicao_unico"',
    })).toBe('Esse nome de exibição já está em uso. Escolha outro.');
  });

  it('traduz erros do Supabase Auth', () => {
    expect(mensagemDeErro({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
      .toBe('E-mail ou senha incorretos.');
    expect(mensagemDeErro({ code: 'user_already_exists', message: 'User already registered' }))
      .toBe('Já existe uma conta com esse e-mail.');
    expect(mensagemDeErro({ code: 'weak_password', message: 'Password is too short' }))
      .toBe('A senha precisa ter pelo menos 10 caracteres.');
    expect(mensagemDeErro({ code: 'over_request_rate_limit', message: 'rate limit' }))
      .toBe('Muitas tentativas. Espere um pouco e tente de novo.');
  });

  it('traduz falha de rede', () => {
    expect(mensagemDeErro({ message: 'TypeError: Failed to fetch' }))
      .toBe('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  });

  it('traduz as protecoes do papel de administrador', () => {
    expect(mensagemDeErro({ message: 'ultimo_admin' }))
      .toBe('Promova outro administrador antes de retirar este.');
    expect(mensagemDeErro({ message: 'nao_pode_agir_sobre_si' }))
      .toBe('Um administrador não altera a própria conta.');
  });

  it('traduz o modo somente leitura', () => {
    expect(mensagemDeErro({ message: 'somente_leitura' }))
      .toBe('O mapa está temporariamente somente para leitura.');
  });

  it('traduz sobreposicao de agendamento', () => {
    expect(mensagemDeErro({ message: 'agendamento_sobreposto' }))
      .toBe('Você já tem um agendamento nesse horário neste local.');
    expect(mensagemDeErro({
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint "agendamentos_sem_sobreposicao"',
    })).toBe('Você já tem um agendamento nesse horário neste local.');
  });

  it('nunca devolve texto vazio', () => {
    expect(mensagemDeErro(null)).toBe('Não foi possível concluir. Tente de novo.');
    expect(mensagemDeErro({})).toBe('Não foi possível concluir. Tente de novo.');
    expect(mensagemDeErro({ message: 'erro desconhecido do servidor' })).toBe('erro desconhecido do servidor');
  });
});
