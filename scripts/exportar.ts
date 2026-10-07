#!/usr/bin/env tsx
/**
 * exportar.ts - backup diario. Gera CSVs de todas as tabelas, sem senhas.
 *
 * O administrador roda uma vez por dia e guarda os arquivos FORA do Supabase
 * (defesa contra conta de administrador comprometida).
 *
 * Uso:
 *   npm run exportar
 *   npm run exportar -- --pasta /caminho/backup
 *   npm run exportar -- --sem-dados-pessoais     (para o encerramento do projeto)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clienteServico, lerArgumentos, registrar } from './lib/ambiente.js';
import { escreverCsv } from './lib/csv.js';

const PAGINA = 1000;

async function lerTudo(
  supabase: ReturnType<typeof clienteServico>,
  tabela: string,
  colunas: string,
  ordem: string,
): Promise<Array<Record<string, unknown>>> {
  const todos: Array<Record<string, unknown>> = [];
  for (let pagina = 0; ; pagina += 1) {
    const { data, error } = await supabase
      .from(tabela)
      .select(colunas)
      .order(ordem)
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) throw new Error(`lendo ${tabela}: ${error.message}`);
    const linhas = (data ?? []) as unknown as Array<Record<string, unknown>>;
    todos.push(...linhas);
    if (linhas.length < PAGINA) break;
  }
  return todos;
}

async function chamarTudo(
  supabase: ReturnType<typeof clienteServico>,
  funcao: string,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase.rpc(funcao);
  if (error) throw new Error(`chamando ${funcao}: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function main(): Promise<void> {
  const args = lerArgumentos();
  const semDadosPessoais = args['sem-dados-pessoais'] === true;
  const supabase = clienteServico();

  const selo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const pasta = typeof args.pasta === 'string' ? args.pasta : join('exportacao', selo);
  await mkdir(pasta, { recursive: true });

  const arquivos: Array<{ nome: string; linhas: Array<Record<string, unknown>> }> = [];

  // Locais (com lat/lng em colunas proprias).
  arquivos.push({ nome: 'locais.csv', linhas: await chamarTudo(supabase, 'exportar_locais') });

  // Agendamentos.
  const agendamentos = await chamarTudo(supabase, 'exportar_agendamentos');
  arquivos.push({
    nome: 'agendamentos.csv',
    linhas: semDadosPessoais
      ? agendamentos.map(({ perfil_id, nome_exibicao, ...resto }) => {
          void perfil_id;
          void nome_exibicao;
          return resto;
        })
      : agendamentos,
  });

  // Contas: e-mail e nome de exibicao, nunca senha nem hash de senha.
  if (semDadosPessoais) {
    registrar('contas.csv nao sera gerado (--sem-dados-pessoais).');
  } else {
    arquivos.push({ nome: 'contas.csv', linhas: await chamarTudo(supabase, 'exportar_contas') });
  }

  arquivos.push({
    nome: 'pedidos-limite.csv',
    linhas: await lerTudo(supabase, 'pedidos_limite', 'id, perfil_id, status, criado_em, decidido_por, decidido_em', 'criado_em'),
  });

  arquivos.push({
    nome: 'historico.csv',
    linhas: await lerTudo(supabase, 'historico', 'id, tabela, registro_id, acao, feito_por, feito_em, antes, depois', 'id'),
  });

  arquivos.push({
    nome: 'config.csv',
    linhas: await lerTudo(supabase, 'config', 'somente_leitura, limite_diario', 'id'),
  });

  arquivos.push({
    nome: 'municipios.csv',
    linhas: await lerTudo(supabase, 'municipios', 'id, nome, uf', 'id'),
  });

  for (const arquivo of arquivos) {
    const caminho = join(pasta, arquivo.nome);
    await writeFile(caminho, escreverCsv(arquivo.linhas), 'utf8');
    registrar(`${caminho}: ${arquivo.linhas.length} linhas`);
  }

  registrar('--------------------------------------------------');
  registrar(`Exportacao em ${pasta}`);
  registrar('Guarde esta pasta FORA do Supabase.');
  if (!semDadosPessoais) {
    registrar('Atencao: contas.csv contem e-mails. Para o encerramento, use --sem-dados-pessoais.');
  }
}

main().catch((erro) => {
  console.error('\nErro:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
