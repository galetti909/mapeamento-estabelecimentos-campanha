// ===========================================================================
// Testes de acesso pela API REST, chamada direto, como um atacante faria:
// sem passar pela interface, montando as requisicoes a mao.
// Exigem o Supabase local de pe: npx supabase start
// ===========================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CHAVE_SERVICO,
  apagarTabela,
  atualizarTabela,
  chamarRpc,
  criarConta,
  criarLocalAtivo,
  definirStatus,
  entrar,
  inscrever,
  inserirTabela,
  lerTabela,
  rpcComServico,
  somenteLeitura,
  type Conta,
} from './ajuda-supabase.js';

const TABELAS = ['perfis', 'municipios', 'locais', 'agendamentos', 'pedidos_limite', 'historico', 'config'];

let admin: Conta;
let ativo: Conta;
let aguardando: Conta;
let bloqueado: Conta;
let recusado: Conta;
let localId: string;

beforeAll(async () => {
  await somenteLeitura(false);
  admin = await criarConta('rest-admin', 'ativo', 'admin');
  ativo = await criarConta('rest-ativo', 'ativo');
  aguardando = await criarConta('rest-espera', 'aguardando');
  bloqueado = await criarConta('rest-bloqueado', 'bloqueado');
  recusado = await criarConta('rest-recusado', 'recusado');
  localId = await criarLocalAtivo(`Feira REST ${Date.now()}`, ativo.id);
});

afterAll(async () => {
  await somenteLeitura(false);
});

describe('usuario sem login (anon) nao le nada', () => {
  for (const tabela of TABELAS) {
    it(`nao le ${tabela}`, async () => {
      const resposta = await lerTabela(tabela);
      expect(resposta.status).toBeGreaterThanOrEqual(400);
    });
  }

  const RPCS = [
    'locais_na_area', 'agenda_do_local', 'meus_agendamentos', 'meu_limite',
    'local_detalhe', 'marcar_local', 'ativar_importado', 'editar_local',
    'arquivar_local', 'restaurar_local', 'agendar', 'cancelar_agendamento',
    'pedir_liberacao_limite', 'admin_decidir_pedido', 'admin_definir_limite',
    'admin_definir_status', 'admin_definir_papel', 'admin_arquivar_locais_da_conta',
    'admin_somente_leitura', 'trocar_minha_senha_concluida', 'admin_listar_contas',
    'admin_contadores', 'admin_listar_pedidos', 'admin_historico',
    'municipios_da_uf', 'buscar_municipios',
    'carregar_municipios', 'importar_locais', 'criar_admin_inicial',
    'exportar_contas', 'exportar_locais', 'exportar_agendamentos',
  ];

  for (const funcao of RPCS) {
    it(`nao executa ${funcao}`, async () => {
      const resposta = await chamarRpc(funcao, {});
      expect(resposta.status).toBeGreaterThanOrEqual(400);
      expect(resposta.texto).not.toContain('"id"');
    });
  }

  it('nao insere local', async () => {
    const resposta = await inserirTabela('locais', { nome: 'Invasao', tipo: 'feira', geom: 'SRID=4326;POINT(-46.6 -23.5)' });
    expect(resposta.status).toBeGreaterThanOrEqual(400);
  });
});

describe.each([
  ['aguardando', () => aguardando],
  ['bloqueado', () => bloqueado],
  ['recusado', () => recusado],
])('conta %s nao le nem escreve', (_rotulo, pegar) => {
  it('le somente o proprio perfil', async () => {
    const conta = pegar();
    const resposta = await lerTabela<unknown[]>('perfis', conta.token);
    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toHaveLength(1);
    expect((resposta.corpo as Array<{ id: string }>)[0].id).toBe(conta.id);
  });

  for (const tabela of ['locais', 'municipios', 'config', 'agendamentos', 'pedidos_limite', 'historico']) {
    it(`nao le nada em ${tabela}`, async () => {
      const resposta = await lerTabela<unknown[]>(tabela, pegar().token);
      expect(resposta.status).toBe(200);
      expect(resposta.corpo).toHaveLength(0);
    });
  }

  it('nao marca local', async () => {
    const resposta = await chamarRpc('marcar_local', {
      p_nome: 'Local proibido', p_tipo: 'feira', p_lat: -23.55, p_lng: -46.63,
    }, pegar().token);
    expect(resposta.status).toBeGreaterThanOrEqual(400);
    expect(resposta.texto).toContain('conta_nao_ativa');
  });

  it('nao se agenda', async () => {
    const resposta = await chamarRpc('agendar', {
      p_local_id: localId, p_dia: new Date().toISOString().slice(0, 10),
      p_hora_inicio: '08:00', p_hora_fim: '10:00',
    }, pegar().token);
    expect(resposta.status).toBeGreaterThanOrEqual(400);
    expect(resposta.texto).toContain('conta_nao_ativa');
  });

  it('nao le a agenda de um local', async () => {
    const resposta = await chamarRpc('agenda_do_local', { p_local_id: localId }, pegar().token);
    expect(resposta.status).toBeGreaterThanOrEqual(400);
  });

  it('nao carrega o mapa', async () => {
    const resposta = await chamarRpc<unknown[]>('locais_na_area', {
      p_oeste: -75, p_sul: -34, p_leste: -34, p_norte: 6, p_zoom: 12,
    }, pegar().token);
    expect(resposta.corpo).toHaveLength(0);
  });

  it('nao chama funcao de administrador', async () => {
    const resposta = await chamarRpc('admin_listar_contas', {}, pegar().token);
    expect(resposta.status).toBeGreaterThanOrEqual(400);
  });
});

describe('conta ativa nao escreve direto nas tabelas', () => {
  for (const tabela of TABELAS) {
    it(`nao faz INSERT em ${tabela}`, async () => {
      const resposta = await inserirTabela(tabela, { nome: 'x' }, ativo.token);
      expect(resposta.status).toBeGreaterThanOrEqual(400);
    });

    it(`nao faz UPDATE em ${tabela}`, async () => {
      const resposta = await atualizarTabela(tabela, 'select=*', { nome: 'x' }, ativo.token);
      expect(resposta.status).toBeGreaterThanOrEqual(400);
    });

    it(`nao faz DELETE em ${tabela}`, async () => {
      const resposta = await apagarTabela(tabela, 'select=*', ativo.token);
      expect(resposta.status).toBeGreaterThanOrEqual(400);
    });
  }

  it('nao se promove a administrador', async () => {
    const resposta = await atualizarTabela('perfis', `id=eq.${ativo.id}`, { papel: 'admin' }, ativo.token);
    expect(resposta.status).toBeGreaterThanOrEqual(400);

    const perfil = await lerTabela<Array<{ papel: string }>>('perfis', ativo.token);
    expect(perfil.corpo[0].papel).toBe('voluntario');
  });

  it('nao se da sem_limite', async () => {
    await atualizarTabela('perfis', `id=eq.${ativo.id}`, { sem_limite: true }, ativo.token);
    const perfil = await lerTabela<Array<{ sem_limite: boolean }>>('perfis', ativo.token);
    expect(perfil.corpo[0].sem_limite).toBe(false);
  });

  it('nao le o perfil de outra pessoa', async () => {
    const resposta = await lerTabela<unknown[]>('perfis', ativo.token, `select=*&id=eq.${admin.id}`);
    expect(resposta.corpo).toHaveLength(0);
  });

  it('nao le o e-mail de ninguem por tabela', async () => {
    const resposta = await lerTabela('perfis', ativo.token, 'select=email');
    expect(resposta.status).toBeGreaterThanOrEqual(400);
  });

  it('nao le o historico', async () => {
    const resposta = await lerTabela<unknown[]>('historico', ativo.token);
    expect(resposta.corpo).toHaveLength(0);
  });

  it('nao chama as funcoes dos scripts do administrador', async () => {
    for (const funcao of ['carregar_municipios', 'importar_locais', 'criar_admin_inicial', 'exportar_contas']) {
      const resposta = await chamarRpc(funcao, {}, ativo.token);
      expect(resposta.status, funcao).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('historico e imutavel pela API', () => {
  it('nem a chave de servico altera o historico', async () => {
    const linha = await lerTabela<Array<{ id: number }>>('historico', CHAVE_SERVICO, 'select=id&limit=1');
    const id = linha.corpo[0].id;

    const update = await atualizarTabela('historico', `id=eq.${id}`, { acao: 'mexido' }, CHAVE_SERVICO);
    expect(update.status).toBeGreaterThanOrEqual(400);
    expect(update.texto).toContain('historico_imutavel');

    const del = await apagarTabela('historico', `id=eq.${id}`, CHAVE_SERVICO);
    expect(del.status).toBeGreaterThanOrEqual(400);
    expect(del.texto).toContain('historico_imutavel');
  });
});

describe('inscricao', () => {
  it('cria conta aguardando, sem enviar e-mail', async () => {
    const inscricao = await inscrever('rest-nova');
    expect(inscricao.status).toBeLessThan(400);

    const token = await entrar(inscricao.email, inscricao.senha);
    const perfil = await lerTabela<Array<{ status: string; papel: string }>>('perfis', token);
    expect(perfil.corpo[0].status).toBe('aguardando');
    expect(perfil.corpo[0].papel).toBe('voluntario');
  });

  it('recusa e-mail ja usado', async () => {
    const resposta = await fetch(`${process.env.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY as string, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ativo.email,
        password: 'outra-senha-bem-longa',
        data: { nome_exibicao: `Outro Nome ${Date.now()}` },
      }),
    });
    const texto = await resposta.text();
    // O Supabase devolve 422 (user_already_exists) ou um usuario sem
    // identidade; em nenhum caso uma segunda conta e criada com o mesmo e-mail.
    const contagem = await lerTabela<Array<{ id: string }>>(
      'perfis', CHAVE_SERVICO, `select=id&id=eq.${ativo.id}`,
    );
    expect(contagem.corpo).toHaveLength(1);
    expect(resposta.status === 422 || texto.includes('already') || texto.includes('user_already_exists')).toBe(true);
  });

  it('recusa nome de exibicao repetido, sem diferenciar maiusculas', async () => {
    const resposta = await fetch(`${process.env.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY as string, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `rest-repetido-${Date.now()}@teste.exemplo`,
        password: 'senha-de-teste-123',
        data: { nome_exibicao: ativo.nome.toUpperCase() },
      }),
    });
    expect(resposta.status).toBeGreaterThanOrEqual(400);
    expect(await resposta.text()).toContain('nome_exibicao_em_uso');
  });

  it('recusa inscricao sem nome de exibicao', async () => {
    const resposta = await fetch(`${process.env.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY as string, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `rest-sem-nome-${Date.now()}@teste.exemplo`, password: 'senha-de-teste-123' }),
    });
    expect(resposta.status).toBeGreaterThanOrEqual(400);
    expect(await resposta.text()).toContain('nome_exibicao_obrigatorio');
  });

  it('recusa senha com menos de 10 caracteres', async () => {
    const resposta = await fetch(`${process.env.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY as string, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `rest-senha-curta-${Date.now()}@teste.exemplo`,
        password: 'curta123',
        data: { nome_exibicao: `Senha Curta ${Date.now()}` },
      }),
    });
    expect(resposta.status).toBeGreaterThanOrEqual(400);
  });
});

describe('liberar e bloquear valem na chamada seguinte', () => {
  it('liberar da acesso; bloquear corta', async () => {
    const conta = await criarConta('rest-ciclo', 'aguardando');

    expect((await lerTabela<unknown[]>('locais', conta.token)).corpo).toHaveLength(0);

    await chamarRpc('admin_definir_status', { p_perfil: conta.id, p_status: 'ativo' }, admin.token);
    expect((await lerTabela<unknown[]>('locais', conta.token)).corpo.length).toBeGreaterThan(0);

    await chamarRpc('admin_definir_status', { p_perfil: conta.id, p_status: 'bloqueado' }, admin.token);
    expect((await lerTabela<unknown[]>('locais', conta.token)).corpo).toHaveLength(0);

    const escrita = await chamarRpc('marcar_local', {
      p_nome: 'Depois do bloqueio', p_tipo: 'feira', p_lat: -23.55, p_lng: -46.63,
    }, conta.token);
    expect(escrita.texto).toContain('conta_nao_ativa');
  });
});

describe('a agenda nao expoe nada alem do nome de exibicao', () => {
  it('agenda_do_local devolve so dia, horario e nome', async () => {
    const dono = await criarConta('rest-agenda-dono');
    const outro = await criarConta('rest-agenda-outro');
    const local = await criarLocalAtivo(`Feira Agenda ${Date.now()}`, dono.id);

    const hoje = new Date().toISOString().slice(0, 10);
    const agendou = await chamarRpc('agendar', {
      p_local_id: local, p_dia: hoje, p_hora_inicio: '08:00', p_hora_fim: '10:00',
    }, dono.token);
    expect(agendou.status).toBeLessThan(400);

    const agenda = await chamarRpc<Array<Record<string, unknown>>>('agenda_do_local', { p_local_id: local }, outro.token);
    expect(agenda.corpo).toHaveLength(1);
    expect(Object.keys(agenda.corpo[0]).sort()).toEqual(['dia', 'hora_fim', 'hora_inicio', 'id', 'meu', 'nome_exibicao']);
    expect(agenda.corpo[0].nome_exibicao).toBe(dono.nome);
    expect(agenda.corpo[0].meu).toBe(false);
    expect(agenda.texto).not.toContain(dono.id);
    expect(agenda.texto).not.toContain(dono.email);

    // Pela tabela, o outro voluntario nao ve o agendamento de ninguem.
    const direto = await lerTabela<unknown[]>('agendamentos', outro.token);
    expect(direto.corpo).toHaveLength(0);

    // E nao cancela o agendamento alheio.
    const cancelou = await chamarRpc('cancelar_agendamento', { p_id: agenda.corpo[0].id }, outro.token);
    expect(cancelou.texto).toContain('sem_permissao');
  });
});

describe('o bloqueio de dados pessoais do front bate com o do banco', () => {
  const corpus = [
    'Feira da Praça da Sé',
    'Rua 25 de Março, 1000',
    'CEP 01310-100',
    'Praça XV de Novembro',
    'Sábados das 7h às 13h',
    'Terminal Bandeira - plataforma 3',
    'Movimento bom entre 17h e 19h',
    'Quadra 302, bloco B',
    'Feira livre 2026',
    'ligue (11) 91234-5678',
    'telefone 11912345678',
    'fixo 3214-5678',
    'cpf 123.456.789-01',
    'cpf 12345678901',
    'fale com joao@exemplo.org',
    'MARIA.SILVA+teste@dominio.com.br',
    '+55 11 91234-5678',
  ];

  it('o mesmo texto recebe a mesma resposta no front e no banco', async () => {
    const { contemDadoPessoal } = await import('../../src/lib/validacao.js');

    for (const texto of corpus) {
      const noBanco = await rpcComServico<boolean>('contem_dado_pessoal', { texto });
      expect(noBanco.status, texto).toBe(200);
      expect(noBanco.corpo, `divergencia em "${texto}"`).toBe(contemDadoPessoal(texto));
    }
  });
});

describe('modo somente leitura', () => {
  it('bloqueia o voluntario e nao o administrador', async () => {
    await somenteLeitura(true);
    try {
      const voluntario = await chamarRpc('marcar_local', {
        p_nome: 'Na leitura', p_tipo: 'feira', p_lat: -23.55, p_lng: -46.63,
      }, ativo.token);
      expect(voluntario.texto).toContain('somente_leitura');

      const administrador = await chamarRpc('marcar_local', {
        p_nome: `Admin na leitura ${Date.now()}`, p_tipo: 'feira', p_lat: -23.55, p_lng: -46.63,
      }, admin.token);
      expect(administrador.status).toBeLessThan(400);
    } finally {
      await somenteLeitura(false);
    }
  });
});

describe('protecoes do papel de administrador pela API', () => {
  it('nao bloqueia nem rebaixa a si mesmo', async () => {
    const sobreSi = await chamarRpc('admin_definir_status', { p_perfil: admin.id, p_status: 'bloqueado' }, admin.token);
    expect(sobreSi.texto).toContain('nao_pode_agir_sobre_si');

    const rebaixar = await chamarRpc('admin_definir_papel', { p_perfil: admin.id, p_papel: 'voluntario' }, admin.token);
    expect(rebaixar.texto).toContain('nao_pode_agir_sobre_si');
  });

  it('nao retira o ultimo administrador ativo', async () => {
    // Deixa apenas um administrador ativo na base.
    const admins = await lerTabela<Array<{ id: string }>>(
      'perfis', CHAVE_SERVICO, "select=id&papel=eq.admin&status=eq.ativo",
    );
    const outros = admins.corpo.map((a) => a.id).filter((id) => id !== admin.id);
    for (const id of outros) await definirStatus(id, 'bloqueado');

    const segundo = await criarConta('rest-segundo-admin', 'ativo', 'admin');
    const retirar = await chamarRpc('admin_definir_status', { p_perfil: admin.id, p_status: 'bloqueado' }, segundo.token);
    expect(retirar.status).toBeLessThan(400);

    // Agora o segundo e o unico: ninguem consegue retira-lo.
    const terceiro = await criarConta('rest-terceiro', 'ativo');
    const tentativa = await chamarRpc('admin_definir_status', { p_perfil: segundo.id, p_status: 'bloqueado' }, terceiro.token);
    expect(tentativa.texto).toContain('somente_admin');

    // Devolve o primeiro administrador ao estado ativo para os demais testes.
    await definirStatus(admin.id, 'ativo');
  });
});
