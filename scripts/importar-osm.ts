#!/usr/bin/env tsx
/**
 * importar-osm.ts - importa locais do OpenStreetMap, municipio por municipio.
 *
 * Tudo que entra fica com status 'importado', numa camada separada e
 * desligada por padrao no mapa, e so vira local ativo quando um voluntario o
 * ativa. O upsert e feito pela chave (origem='osm', origem_id):
 *   - nao existe              -> insere como 'importado'
 *   - existe e e 'importado'  -> atualiza nome, posicao e tags
 *   - ja ativado ou arquivado -> atualiza so osm_tags, nunca o status
 *
 * Regras de uso do Overpass respeitadas aqui: uma consulta por vez, pausa de
 * 2 s entre municipios, timeout:90, User-Agent com nome do projeto e contato,
 * nova tentativa com espera crescente em 429 e 504.
 *
 * Uso:
 *   npm run importar-osm -- --municipio 3550308
 *   npm run importar-osm -- --municipio 3550308,3509502
 *   npm run importar-osm -- --uf SP
 *   npm run importar-osm -- --municipio 3550308 --dry-run
 *   npm run importar-osm -- --municipio 3550308 --arquivo tests/fixtures/overpass-3550308.json
 */

import { readFile } from 'node:fs/promises';
import {
  clienteServico, esperar, lerArgumentos, registrar, tentarComEspera,
} from './lib/ambiente.js';
import {
  converterElemento, consultaOverpass, consultaOverpassPorNome,
  type ElementoOverpass, type LocalImportado, type MotivoIgnorado,
} from './lib/mapeamento-osm.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const TIMEOUT_OVERPASS = 90;
const PAUSA_ENTRE_MUNICIPIOS_MS = 2000;
const LOTE = 300;

const CONTATO = process.env.OSM_CONTATO ?? 'joaogaletti@gmail.com';
const USER_AGENT = `MapaDeCampanha/1.0 (importacao de locais para mapeamento de campanha; ${CONTATO})`;

interface Municipio {
  id: number;
  nome: string;
  uf: string;
}

async function consultarOverpass(consulta: string, rotulo: string): Promise<ElementoOverpass[]> {
  return tentarComEspera(
    async () => {
      const resposta = await fetch(OVERPASS, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ data: consulta }).toString(),
      });

      if (resposta.status === 429 || resposta.status === 504) {
        throw new Error(`Overpass ocupado (HTTP ${resposta.status})`);
      }
      if (!resposta.ok) {
        throw new Error(`Overpass HTTP ${resposta.status} ${resposta.statusText}`);
      }

      const corpo = (await resposta.json()) as { elements?: ElementoOverpass[] };
      return corpo.elements ?? [];
    },
    {
      aoFalhar: (erro, tentativa, espera) =>
        registrar(`  ${rotulo}: ${(erro as Error).message} (tentativa ${tentativa}); esperando ${espera / 1000}s`),
    },
  );
}

export interface ResumoMunicipio {
  municipio: number;
  nome: string;
  uf: string;
  elementos: number;
  novos: number;
  atualizados: number;
  preservados: number;
  ignorados: number;
  descartados: Record<MotivoIgnorado, number>;
}

function descartadosVazio(): Record<MotivoIgnorado, number> {
  return { sem_tipo: 0, sem_nome: 0, sem_posicao: 0, nome_invalido: 0 };
}

async function main(): Promise<void> {
  const args = lerArgumentos();
  const dryRun = args['dry-run'] === true;
  const supabase = dryRun ? null : clienteServico();

  if (!args.municipio && !args.uf) {
    throw new Error('Informe --municipio <codigo IBGE> (um ou vários, separados por vírgula) ou --uf <sigla>.');
  }

  // Lista de municipios a processar, lida do proprio banco (malha do IBGE).
  const leitor = clienteServico();
  let municipios: Municipio[] = [];

  if (typeof args.municipio === 'string') {
    const codigos = args.municipio.split(',').map((c) => Number(c.trim())).filter(Number.isInteger);
    const { data, error } = await leitor.from('municipios').select('id, nome, uf').in('id', codigos);
    if (error) throw new Error(`lendo municipios: ${error.message}`);
    municipios = (data ?? []) as Municipio[];
    const faltando = codigos.filter((c) => !municipios.some((m) => m.id === c));
    if (faltando.length > 0) {
      throw new Error(
        `Municipio(s) nao encontrado(s) na base: ${faltando.join(', ')}. ` +
          'Rode scripts/carregar-municipios.ts primeiro.',
      );
    }
  } else {
    const uf = String(args.uf).toUpperCase();
    const { data, error } = await leitor.from('municipios').select('id, nome, uf').eq('uf', uf).order('nome');
    if (error) throw new Error(`lendo municipios de ${uf}: ${error.message}`);
    municipios = (data ?? []) as Municipio[];
    if (municipios.length === 0) throw new Error(`Nenhum municipio de ${uf} na base.`);
  }

  registrar(`${municipios.length} municipio(s) a processar.${dryRun ? ' (--dry-run: nada sera gravado)' : ''}`);

  const resumos: ResumoMunicipio[] = [];

  for (const [indice, municipio] of municipios.entries()) {
    const rotulo = `${municipio.nome}/${municipio.uf} (${municipio.id})`;
    registrar(`[${indice + 1}/${municipios.length}] ${rotulo}`);

    let elementos: ElementoOverpass[];

    if (typeof args.arquivo === 'string') {
      const bruto = JSON.parse(await readFile(args.arquivo, 'utf8')) as { elements?: ElementoOverpass[] };
      elementos = bruto.elements ?? [];
      registrar(`  ${elementos.length} elementos lidos de ${args.arquivo}`);
    } else {
      // 1) area pela tag IBGE:GEOCODIGO; 2) alternativa por nome do municipio e UF.
      elementos = await consultarOverpass(consultaOverpass(municipio.id, TIMEOUT_OVERPASS), rotulo);
      if (elementos.length === 0) {
        registrar('  nada pelo IBGE:GEOCODIGO; tentando pelo nome do municipio e UF');
        elementos = await consultarOverpass(
          consultaOverpassPorNome(municipio.nome, municipio.uf, TIMEOUT_OVERPASS),
          rotulo,
        );
      }
      registrar(`  ${elementos.length} elementos no Overpass`);
    }

    const locais: LocalImportado[] = [];
    const descartados = descartadosVazio();
    const vistos = new Set<string>();

    for (const elemento of elementos) {
      const { local, motivo } = converterElemento(elemento);
      if (!local) {
        if (motivo) descartados[motivo] += 1;
        continue;
      }
      if (vistos.has(local.origem_id)) continue;
      vistos.add(local.origem_id);
      locais.push(local);
    }

    const resumo: ResumoMunicipio = {
      municipio: municipio.id,
      nome: municipio.nome,
      uf: municipio.uf,
      elementos: elementos.length,
      novos: 0,
      atualizados: 0,
      preservados: 0,
      ignorados: 0,
      descartados,
    };

    if (dryRun) {
      registrar(`  [dry-run] ${locais.length} locais seriam gravados`);
    } else {
      for (let i = 0; i < locais.length; i += LOTE) {
        const lote = locais.slice(i, i + LOTE);
        const { data, error } = await supabase!.rpc('importar_locais', {
          p_origem: 'osm',
          p_acao: 'importar_osm',
          p_registro_id: String(municipio.id),
          p_dados: lote,
        });
        if (error) throw new Error(`gravando ${rotulo}: ${error.message}`);
        const r = (data as Array<{
          novos: number; atualizados: number; preservados: number; ignorados: number; erros: unknown[];
        }>)[0];
        resumo.novos += r.novos;
        resumo.atualizados += r.atualizados;
        resumo.preservados += r.preservados;
        resumo.ignorados += r.ignorados;
        for (const erro of r.erros as Array<{ nome: string; erro: string }>) {
          registrar(`  ignorado: ${erro.nome} - ${erro.erro}`);
        }
      }
    }

    registrar(
      `  novos ${resumo.novos} | atualizados ${resumo.atualizados} | ` +
        `status preservado ${resumo.preservados} | ignorados ${resumo.ignorados} | ` +
        `descartados sem tipo ${descartados.sem_tipo}, sem nome ${descartados.sem_nome}, ` +
        `sem posicao ${descartados.sem_posicao}`,
    );

    resumos.push(resumo);

    if (indice < municipios.length - 1 && typeof args.arquivo !== 'string') {
      await esperar(PAUSA_ENTRE_MUNICIPIOS_MS);
    }
  }

  registrar('--------------------------------------------------');
  for (const r of resumos) {
    registrar(
      `${r.nome}/${r.uf} (${r.municipio}): +${r.novos} novos, ${r.atualizados} atualizados, ` +
        `${r.preservados} preservados, ${r.ignorados} ignorados`,
    );
  }
  const total = resumos.reduce(
    (acc, r) => ({
      novos: acc.novos + r.novos,
      atualizados: acc.atualizados + r.atualizados,
      preservados: acc.preservados + r.preservados,
      ignorados: acc.ignorados + r.ignorados,
    }),
    { novos: 0, atualizados: 0, preservados: 0, ignorados: 0 },
  );
  registrar(
    `Total: +${total.novos} novos, ${total.atualizados} atualizados, ` +
      `${total.preservados} preservados, ${total.ignorados} ignorados.`,
  );
  if (dryRun) registrar('Nada foi gravado (--dry-run).');
}

main().catch((erro) => {
  console.error('\nErro:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
