// ===========================================================================
// Scripts do administrador, rodados de verdade contra o Supabase local, com
// as respostas do Overpass e a malha do IBGE lidas de fixtures (sem rede).
// Cobre: mapeamento de tipos, idempotencia, preservacao de status e --dry-run.
// ===========================================================================
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { CHAVE_SERVICO, criarConta, lerTabela, rpcComServico } from './ajuda-supabase.js';

const rodar = promisify(execFile);

const MALHA_DF = 'tests/fixtures/malha-ibge-df.json';
const NOMES = 'tests/fixtures/municipios-ibge-amostra.json';
const OVERPASS = 'tests/fixtures/overpass-3550308.json';
const SP = '3550308';

async function script(nome: string, argumentos: string[], ambiente: Record<string, string> = {}): Promise<string> {
  const { stdout, stderr } = await rodar(
    'npx',
    ['tsx', `scripts/${nome}.ts`, ...argumentos],
    { env: { ...process.env, ...ambiente }, cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 },
  );
  return stdout + stderr;
}

async function contarPorOrigem(origem: string): Promise<number> {
  const resposta = await lerTabela<Array<{ id: string }>>(
    'locais', CHAVE_SERVICO, `select=id&origem=eq.${origem}&limit=10000`,
  );
  return resposta.corpo.length;
}

describe('carregar-municipios.ts', () => {
  it('e idempotente: rodar de novo atualiza sem duplicar', async () => {
    const antes = (await lerTabela<Array<{ id: number }>>('municipios', CHAVE_SERVICO, 'select=id&limit=10000')).corpo.length;

    const primeira = await script('carregar-municipios', ['--arquivo', MALHA_DF, '--nomes', NOMES]);
    expect(primeira).toContain('Resumo:');

    const meio = (await lerTabela<Array<{ id: number }>>('municipios', CHAVE_SERVICO, 'select=id&limit=10000')).corpo.length;

    const segunda = await script('carregar-municipios', ['--arquivo', MALHA_DF, '--nomes', NOMES]);
    expect(segunda).toContain('0 inseridos');

    const depois = (await lerTabela<Array<{ id: number }>>('municipios', CHAVE_SERVICO, 'select=id&limit=10000')).corpo.length;
    expect(depois).toBe(meio);
    expect(depois).toBeGreaterThanOrEqual(antes);
  });

  it('grava o nome e a UF a partir da lista do IBGE', async () => {
    await script('carregar-municipios', ['--arquivo', MALHA_DF, '--nomes', NOMES]);
    const df = await lerTabela<Array<{ nome: string; uf: string }>>(
      'municipios', CHAVE_SERVICO, 'select=nome,uf&id=eq.5300108',
    );
    expect(df.corpo[0]).toEqual({ nome: 'Brasília', uf: 'DF' });
  });

  it('--dry-run nao grava nada', async () => {
    const saida = await script('carregar-municipios', ['--arquivo', MALHA_DF, '--nomes', NOMES, '--dry-run']);
    expect(saida).toContain('[dry-run]');
    expect(saida).toContain('Nada foi gravado');
  });
});

describe('importar-osm.ts', () => {
  beforeAll(async () => {
    // Garante que Sao Paulo esta na base de municipios.
    const sp = await lerTabela<Array<{ id: number }>>('municipios', CHAVE_SERVICO, `select=id&id=eq.${SP}`);
    expect(sp.corpo).toHaveLength(1);

    // Este arquivo roda contra um banco que pode ja ter sido usado por outra
    // suite (ou por uma execucao anterior). Os locais de origem 'osm' sao
    // removidos com a chave de servico para que a importacao parta de um
    // estado conhecido. Nenhuma funcao do app apaga locais: isto e apoio de
    // teste, feito fora do app.
    const apagou = await fetch(`${process.env.SUPABASE_URL}/rest/v1/locais?origem=eq.osm`, {
      method: 'DELETE',
      headers: { apikey: CHAVE_SERVICO, Authorization: `Bearer ${CHAVE_SERVICO}` },
    });
    expect(apagou.status).toBeLessThan(400);
  });

  it('--dry-run nao grava nada', async () => {
    const antes = await contarPorOrigem('osm');
    const saida = await script('importar-osm', ['--municipio', SP, '--arquivo', OVERPASS, '--dry-run']);
    expect(saida).toContain('[dry-run]');
    expect(saida).toContain('Nada foi gravado');
    expect(await contarPorOrigem('osm')).toBe(antes);
  });

  it('importa os locais da fixture como "importado"', async () => {
    const saida = await script('importar-osm', ['--municipio', SP, '--arquivo', OVERPASS]);
    expect(saida).toContain('Total:');

    const importados = await lerTabela<Array<{ status: string; origem_id: string; tipo: string }>>(
      'locais', CHAVE_SERVICO, 'select=status,origem_id,tipo&origem=eq.osm&limit=1000',
    );
    expect(importados.corpo.length).toBeGreaterThan(10);
    for (const local of importados.corpo) {
      expect(local.status).toBe('importado');
      expect(local.origem_id).toMatch(/^(node|way|relation)\/\d+$/);
    }
  });

  it('mapeia as tags para os tipos da especificacao', async () => {
    await script('importar-osm', ['--municipio', SP, '--arquivo', OVERPASS]);

    const esperados: Array<[string, string]> = [
      ['way/900001', 'praca'],
      ['way/900002', 'parque'],
      ['node/900003', 'mercado'],
      ['node/900004', 'padaria'],
      ['node/900005', 'bar'],
      ['node/900006', 'cafe'],
      ['node/900007', 'restaurante'],
      ['node/900008', 'terminal'],
      ['node/900009', 'comercio'],
      ['node/900010', 'mercado'],
      ['node/900011', 'restaurante'],
      ['node/900012', 'terminal'],
    ];

    for (const [origemId, tipo] of esperados) {
      const local = await lerTabela<Array<{ tipo: string }>>(
        'locais', CHAVE_SERVICO, `select=tipo&origem=eq.osm&origem_id=eq.${encodeURIComponent(origemId)}`,
      );
      expect(local.corpo[0]?.tipo, origemId).toBe(tipo);
    }
  });

  it('guarda somente as tags usadas no mapeamento', async () => {
    const local = await lerTabela<Array<{ osm_tags: Record<string, string> }>>(
      'locais', CHAVE_SERVICO, `select=osm_tags&origem=eq.osm&origem_id=eq.${encodeURIComponent('node/900005')}`,
    );
    expect(Object.keys(local.corpo[0].osm_tags).sort()).toEqual(['amenity', 'name']);
  });

  it('ignora elementos sem nome, exceto pracas e feiras', async () => {
    // node/900013 e um cafe sem nome: nao entra.
    const cafe = await lerTabela<unknown[]>(
      'locais', CHAVE_SERVICO, `select=id&origem=eq.osm&origem_id=eq.${encodeURIComponent('node/900013')}`,
    );
    expect(cafe.corpo).toHaveLength(0);

    // node/900014 e uma feira sem nome e way/900015 uma praca sem nome: entram.
    for (const [origemId, nome] of [['node/900014', 'Feira sem nome'], ['way/900015', 'Praça sem nome']]) {
      const local = await lerTabela<Array<{ nome: string }>>(
        'locais', CHAVE_SERVICO, `select=nome&origem=eq.osm&origem_id=eq.${encodeURIComponent(origemId)}`,
      );
      expect(local.corpo[0]?.nome, origemId).toBe(nome);
    }
  });

  it('ignora ponto fora do Brasil sem derrubar o lote', async () => {
    const saida = await script('importar-osm', ['--municipio', SP, '--arquivo', OVERPASS]);
    expect(saida).toContain('ponto_fora_do_brasil');

    const portenho = await lerTabela<unknown[]>(
      'locais', CHAVE_SERVICO, `select=id&origem=eq.osm&origem_id=eq.${encodeURIComponent('node/900016')}`,
    );
    expect(portenho.corpo).toHaveLength(0);
  });

  it('rodar duas vezes no mesmo municipio nao cria duplicatas', async () => {
    await script('importar-osm', ['--municipio', SP, '--arquivo', OVERPASS]);
    const depoisDaPrimeira = await contarPorOrigem('osm');

    const segunda = await script('importar-osm', ['--municipio', SP, '--arquivo', OVERPASS]);
    expect(segunda).toMatch(/\+0 novos/);

    expect(await contarPorOrigem('osm')).toBe(depoisDaPrimeira);
  });

  it('um local ativado nao volta a "importado" numa nova importacao', async () => {
    const alvo = encodeURIComponent('node/900003');
    const antes = await lerTabela<Array<{ id: string }>>(
      'locais', CHAVE_SERVICO, `select=id&origem=eq.osm&origem_id=eq.${alvo}`,
    );
    const id = antes.corpo[0].id;

    // Simula a ativacao por um voluntario. A conta e criada aqui: o arquivo
    // nao pode depender de outra suite ter rodado antes.
    const voluntario = await criarConta('script-ativador');
    const perfil = voluntario.id;

    const ativou = await fetch(`${process.env.SUPABASE_URL}/rest/v1/locais?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey: CHAVE_SERVICO,
        Authorization: `Bearer ${CHAVE_SERVICO}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'ativo', ativado_por: perfil, ativado_em: new Date().toISOString() }),
    });
    expect(ativou.status).toBeLessThan(400);

    const saida = await script('importar-osm', ['--municipio', SP, '--arquivo', OVERPASS]);
    expect(saida).toMatch(/preservados/);

    const depois = await lerTabela<Array<{ status: string; nome: string }>>(
      'locais', CHAVE_SERVICO, `select=status,nome&origem=eq.osm&origem_id=eq.${alvo}`,
    );
    expect(depois.corpo[0].status).toBe('ativo');
    expect(depois.corpo[0].nome).toBe('Mercado Central');
  });

  it('registra o resumo da importacao no historico', async () => {
    const historico = await lerTabela<Array<{ acao: string; depois: Record<string, unknown> }>>(
      'historico', CHAVE_SERVICO,
      `select=acao,depois&tabela=eq.importacao&registro_id=eq.${SP}&order=id.desc&limit=1`,
    );
    expect(historico.corpo[0].acao).toBe('importar_osm');
    expect(historico.corpo[0].depois).toHaveProperty('novos');
    expect(historico.corpo[0].depois).toHaveProperty('preservados');
  });

  it('recusa municipio que nao esta na base', async () => {
    await expect(script('importar-osm', ['--municipio', '9999999', '--arquivo', OVERPASS]))
      .rejects.toThrow(/nao encontrado|carregar-municipios/i);
  });

  it('exige --municipio ou --uf', async () => {
    await expect(script('importar-osm', ['--arquivo', OVERPASS]))
      .rejects.toThrow(/--municipio|--uf/);
  });
});

describe('importar-csv.ts', () => {
  let csv: string;

  beforeAll(async () => {
    const pasta = await mkdtemp(join(tmpdir(), 'mapa-csv-'));
    csv = join(pasta, 'feiras.csv');
    await writeFile(
      csv,
      [
        'nome,tipo,lat,lng,endereco,id_externo',
        'Feira Livre da Rua Augusta,feira,-23.5505,-46.6333,"Rua Augusta, 100",FEIRA-CSV-1',
        'Feira do Largo do Arouche,feira,-23.5450,-46.6420,Largo do Arouche,FEIRA-CSV-2',
        'Tipo Inexistente,academia,-23.55,-46.63,,FEIRA-CSV-3',
        'Sem Coordenada,feira,,,,FEIRA-CSV-4',
        'Fora do Brasil,feira,-34.6037,-58.3816,,FEIRA-CSV-5',
      ].join('\n') + '\n',
      'utf8',
    );
  });

  it('--dry-run nao grava nada', async () => {
    const antes = await contarPorOrigem('dados_abertos');
    const saida = await script('importar-csv', ['--arquivo', csv, '--dry-run']);
    expect(saida).toContain('Nada foi gravado');
    expect(await contarPorOrigem('dados_abertos')).toBe(antes);
  });

  it('importa as linhas validas e ignora as invalidas', async () => {
    const saida = await script('importar-csv', ['--arquivo', csv]);
    expect(saida).toContain('tipo "academia" nao existe');
    expect(saida).toContain('lat/lng invalidos');
    expect(saida).toContain('ponto_fora_do_brasil');

    const importados = await lerTabela<Array<{ origem_id: string; status: string; endereco: string }>>(
      'locais', CHAVE_SERVICO, 'select=origem_id,status,endereco&origem=eq.dados_abertos&order=origem_id',
    );
    expect(importados.corpo.map((l) => l.origem_id)).toEqual(['FEIRA-CSV-1', 'FEIRA-CSV-2']);
    expect(importados.corpo[0].status).toBe('importado');
    expect(importados.corpo[0].endereco).toBe('Rua Augusta, 100');
  });

  it('rodar de novo nao cria duplicatas', async () => {
    const antes = await contarPorOrigem('dados_abertos');
    const saida = await script('importar-csv', ['--arquivo', csv]);
    expect(saida).toContain('+0 novos');
    expect(await contarPorOrigem('dados_abertos')).toBe(antes);
  });
});

describe('criar-admin.ts', () => {
  const email = `admin-script-${Date.now()}@teste.exemplo`;
  const nome = `Admin Script ${Date.now()}`;

  it('cria a conta ja como administrador ativo', async () => {
    const saida = await script('criar-admin', ['--email', email, '--nome', nome], {
      ADMIN_SENHA: 'senha-de-admin-123',
    });
    expect(saida).toContain('Administrador pronto');
    expect(saida).toContain('papel: admin | status: ativo');

    const contas = await rpcComServico<Array<{ email: string; papel: string; status: string }>>('exportar_contas');
    const conta = contas.corpo.find((c) => c.email === email);
    expect(conta).toBeDefined();
    expect(conta?.papel).toBe('admin');
    expect(conta?.status).toBe('ativo');
  });

  it('rodar de novo nao duplica', async () => {
    const saida = await script('criar-admin', ['--email', email, '--nome', nome], { ADMIN_SENHA: 'senha-de-admin-123' });
    expect(saida).toContain('ja existe');
    expect(saida).toContain('papel: admin | status: ativo');

    const contas = await rpcComServico<Array<{ email: string }>>('exportar_contas');
    expect(contas.corpo.filter((c) => c.email === email)).toHaveLength(1);
  });
});

describe('criar-admin.ts: a conta padrao da especificacao', () => {
  it('sem --email, cria a conta de ADMIN_EMAIL como administrador ativo', async () => {
    const esperado = (process.env.ADMIN_EMAIL ?? 'joaogaletti@gmail.com').toLowerCase();
    expect(esperado).toBe('joaogaletti@gmail.com');

    const saida = await script('criar-admin', [], { ADMIN_SENHA: 'senha-do-dono-123' });
    expect(saida).toContain(esperado);
    expect(saida).toContain('papel: admin | status: ativo');

    const contas = await rpcComServico<Array<{ email: string; papel: string; status: string }>>('exportar_contas');
    const encontradas = contas.corpo.filter((c) => c.email.toLowerCase() === esperado);
    expect(encontradas).toHaveLength(1);
    expect(encontradas[0].papel).toBe('admin');
    expect(encontradas[0].status).toBe('ativo');

    // Rodar de novo nao duplica.
    await script('criar-admin', [], { ADMIN_SENHA: 'senha-do-dono-123' });
    const depois = await rpcComServico<Array<{ email: string }>>('exportar_contas');
    expect(depois.corpo.filter((c) => c.email.toLowerCase() === esperado)).toHaveLength(1);
  });
});

describe('exportar.ts', () => {
  it('gera os CSVs de todas as tabelas, sem senha nenhuma', async () => {
    const pasta = await mkdtemp(join(tmpdir(), 'mapa-export-'));
    const saida = await script('exportar', ['--pasta', pasta]);
    expect(saida).toContain('Exportacao em');

    const arquivos = (await readdir(pasta)).sort();
    expect(arquivos).toEqual([
      'agendamentos.csv', 'config.csv', 'contas.csv', 'historico.csv',
      'locais.csv', 'municipios.csv', 'pedidos-limite.csv',
    ]);

    for (const arquivo of arquivos) {
      const conteudo = await readFile(join(pasta, arquivo), 'utf8');
      const minusculo = conteudo.toLowerCase();

      // Nenhuma senha nem hash de senha sai na exportacao. A marca
      // "trocar_senha" e so um booleano do perfil e pode aparecer.
      expect(minusculo).not.toContain('encrypted_password');
      expect(minusculo).not.toContain('recovery_token');
      expect(minusculo).not.toContain('confirmation_token');
      expect(conteudo).not.toMatch(/\$2[aby]\$\d{2}\$/);  // hash bcrypt
      expect(minusculo).not.toContain('senha-de-teste-123'); // senha usada nos testes
      expect(minusculo).not.toContain('senha-de-admin-123');

      // Nenhuma coluna chamada "senha" ou "password" no cabecalho.
      const colunas = conteudo.split('\n')[0].split(',').map((c) => c.trim().toLowerCase());
      expect(colunas).not.toContain('senha');
      expect(colunas).not.toContain('password');
    }

    const locais = await readFile(join(pasta, 'locais.csv'), 'utf8');
    expect(locais.split('\n')[0]).toContain('lat');
    expect(locais.split('\n')[0]).toContain('lng');
  });

  it('--sem-dados-pessoais nao gera contas.csv nem nomes na agenda', async () => {
    const pasta = await mkdtemp(join(tmpdir(), 'mapa-export-anon-'));
    await script('exportar', ['--pasta', pasta, '--sem-dados-pessoais']);

    const arquivos = await readdir(pasta);
    expect(arquivos).not.toContain('contas.csv');

    const agendamentos = await readFile(join(pasta, 'agendamentos.csv'), 'utf8');
    expect(agendamentos.split('\n')[0]).not.toContain('nome_exibicao');
    expect(agendamentos.split('\n')[0]).not.toContain('perfil_id');
  });
});

describe('o ambiente exige a chave de servico', () => {
  it('sem SUPABASE_SERVICE_ROLE_KEY o script explica o que falta', async () => {
    await expect(
      rodar('npx', ['tsx', 'scripts/exportar.ts'], {
        env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '', DOTENV_CONFIG_PATH: '/dev/null' },
        cwd: process.cwd(),
      }),
    ).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY|\.env\.example/);
  });
});
