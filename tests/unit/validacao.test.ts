import { describe, expect, it } from 'vitest';
import {
  AVISO_DADO_PESSOAL,
  contemDadoPessoal,
  validarAgendamento,
  validarEmail,
  validarLocal,
  validarMotivoArquivamento,
  validarNomeExibicao,
  validarSenha,
} from '../../src/lib/validacao.js';

describe('bloqueio de dados pessoais', () => {
  const bloqueados = [
    'ligue (11) 91234-5678',
    'ligue (11)912345678',
    'telefone 11912345678',
    'fone 1191234567',
    'zap 91234-5678',
    'fixo 3214-5678',
    'cpf 123.456.789-01',
    'cpf 12345678901',
    'fale com joao@exemplo.org',
    'MARIA.SILVA+teste@dominio.com.br',
    '+55 11 91234-5678',
    '+5511912345678',
  ];

  for (const texto of bloqueados) {
    it(`recusa "${texto}"`, () => {
      expect(contemDadoPessoal(texto)).toBe(true);
    });
  }

  const permitidos = [
    'Feira da Praça da Sé',
    'Rua 25 de Março, 1000',
    'CEP 01310-100',
    'Praça XV de Novembro',
    'Mercado Municipal, box 12',
    'Sábados das 7h às 13h',
    'Terminal Bandeira - plataforma 3',
    'Bar do Zé (esquina com a Av. Paulista)',
    'Movimento bom entre 17h e 19h',
    'Quadra 302, bloco B',
    'Feira livre 2026',
  ];

  for (const texto of permitidos) {
    it(`aceita "${texto}"`, () => {
      expect(contemDadoPessoal(texto)).toBe(false);
    });
  }

  it('aceita texto vazio e nulo', () => {
    expect(contemDadoPessoal('')).toBe(false);
    expect(contemDadoPessoal(null)).toBe(false);
    expect(contemDadoPessoal(undefined)).toBe(false);
  });
});

describe('validarNomeExibicao', () => {
  it('aceita nome de 2 a 40 caracteres', () => {
    expect(validarNomeExibicao('Jo')).toEqual([]);
    expect(validarNomeExibicao('a'.repeat(40))).toEqual([]);
  });

  it('recusa nome curto demais', () => {
    expect(validarNomeExibicao('J')).toHaveLength(1);
  });

  it('recusa nome longo demais', () => {
    expect(validarNomeExibicao('a'.repeat(41))).toHaveLength(1);
  });

  it('conta acentos como um caractere', () => {
    expect(validarNomeExibicao('Çã')).toEqual([]);
  });

  it('recusa nome com dado pessoal', () => {
    expect(validarNomeExibicao('joao@exemplo.org')[0].mensagem).toBe(AVISO_DADO_PESSOAL);
  });
});

describe('validarSenha', () => {
  it('exige pelo menos 10 caracteres', () => {
    expect(validarSenha('123456789')).toHaveLength(1);
    expect(validarSenha('1234567890')).toEqual([]);
  });

  it('exige confirmacao igual quando informada', () => {
    expect(validarSenha('senha-boa-123', 'senha-boa-124')).toHaveLength(1);
    expect(validarSenha('senha-boa-123', 'senha-boa-123')).toEqual([]);
  });
});

describe('validarEmail', () => {
  it('aceita e-mail simples', () => {
    expect(validarEmail('alguem@exemplo.org')).toEqual([]);
  });

  it('recusa e-mail sem arroba ou sem dominio', () => {
    expect(validarEmail('alguem')).toHaveLength(1);
    expect(validarEmail('alguem@')).toHaveLength(1);
    expect(validarEmail('alguem@dominio')).toHaveLength(1);
  });
});

describe('validarLocal', () => {
  it('aceita um local completo', () => {
    expect(validarLocal({
      nome: 'Feira do Largo',
      endereco: 'Largo do Arouche, s/n',
      melhor_horario: 'Sábados de manhã',
      observacoes: 'Muito movimento perto das bancas de fruta.',
    })).toEqual([]);
  });

  it('exige nome de 2 a 80 caracteres', () => {
    expect(validarLocal({ nome: 'F' })).toHaveLength(1);
    expect(validarLocal({ nome: 'a'.repeat(81) })).toHaveLength(1);
    expect(validarLocal({ nome: 'a'.repeat(80) })).toEqual([]);
  });

  it('respeita os limites de tamanho dos campos opcionais', () => {
    expect(validarLocal({ nome: 'Feira', endereco: 'a'.repeat(161) })).toHaveLength(1);
    expect(validarLocal({ nome: 'Feira', melhor_horario: 'a'.repeat(81) })).toHaveLength(1);
    expect(validarLocal({ nome: 'Feira', observacoes: 'a'.repeat(501) })).toHaveLength(1);
    expect(validarLocal({ nome: 'Feira', observacoes: 'a'.repeat(500) })).toEqual([]);
  });

  it('aceita campos opcionais vazios', () => {
    expect(validarLocal({ nome: 'Feira', endereco: '', melhor_horario: '', observacoes: '' })).toEqual([]);
  });

  it('bloqueia dado pessoal em cada campo', () => {
    for (const campo of ['nome', 'endereco', 'melhor_horario', 'observacoes'] as const) {
      const campos = { nome: 'Feira Boa', [campo]: 'ligue (11) 91234-5678' };
      const problemas = validarLocal(campos);
      expect(problemas.some((p) => p.campo === campo && p.mensagem === AVISO_DADO_PESSOAL)).toBe(true);
    }
  });
});

describe('validarMotivoArquivamento', () => {
  it('exige de 3 a 300 caracteres', () => {
    expect(validarMotivoArquivamento('ok')).toHaveLength(1);
    expect(validarMotivoArquivamento('fechou')).toEqual([]);
    expect(validarMotivoArquivamento('a'.repeat(301))).toHaveLength(1);
  });
});

describe('validarAgendamento', () => {
  const hoje = '2026-10-06';

  it('aceita hoje', () => {
    expect(validarAgendamento(hoje, '08:00', '10:00', hoje)).toEqual([]);
  });

  it('aceita o 60o dia', () => {
    expect(validarAgendamento('2026-12-05', '08:00', '10:00', hoje)).toEqual([]);
  });

  it('recusa o 61o dia', () => {
    expect(validarAgendamento('2026-12-06', '08:00', '10:00', hoje)).toHaveLength(1);
  });

  it('recusa dia no passado', () => {
    expect(validarAgendamento('2026-10-05', '08:00', '10:00', hoje)).toHaveLength(1);
  });

  it('recusa hora de fim menor ou igual a de inicio', () => {
    expect(validarAgendamento(hoje, '10:00', '08:00', hoje)).toHaveLength(1);
    expect(validarAgendamento(hoje, '10:00', '10:00', hoje)).toHaveLength(1);
  });

  it('exige os dois horarios', () => {
    expect(validarAgendamento(hoje, '', '10:00', hoje)).toHaveLength(1);
  });
});
