#!/usr/bin/env tsx
/**
 * carregar-municipios.ts - base geografica do app (roda uma vez).
 *
 * Baixa a malha municipal do IBGE em GeoJSON, UF por UF, e grava os 5.570
 * municipios com codigo, nome e UF. As geometrias sao simplificadas no banco
 * com ST_SimplifyPreserveTopology (tolerancia ~0,001 grau) para manter as
 * consultas por area leves. Rodar de novo atualiza sem duplicar.
 *
 * Fontes confirmadas em 06/10/2026:
 *   - malha por UF, intrarregiao=municipio:
 *     https://servicodados.ibge.gov.br/api/v3/malhas/estados/{UF}
 *       ?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio
 *     devolve FeatureCollection com properties.codarea = codigo IBGE (7 digitos)
 *   - nomes e UF dos municipios:
 *     https://servicodados.ibge.gov.br/api/v1/localidades/municipios
 *
 * Uso:
 *   npm run carregar-municipios
 *   npm run carregar-municipios -- --uf SP
 *   npm run carregar-municipios -- --arquivo tests/fixtures/malha-ibge-df.json
 *   npm run carregar-municipios -- --dry-run
 *
 * --nomes <arquivo> usa uma lista local de municipios em vez da API do IBGE.
 * E o que permite aos testes rodarem com fixtures, sem rede.
 */

import { readFile } from 'node:fs/promises';
import { clienteServico, esperar, lerArgumentos, registrar, tentarComEspera } from './lib/ambiente.js';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

const IBGE_MUNICIPIOS = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const IBGE_MALHA = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados';
const TOLERANCIA = 0.001;
const LOTE = 150;

interface MunicipioIbge {
  id: number;
  nome: string;
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } | null;
  'regiao-imediata'?: { 'regiao-intermediaria'?: { UF?: { sigla?: string } } } | null;
}

interface Feature {
  properties: Record<string, unknown>;
  geometry: unknown;
}

function ufDoMunicipio(m: MunicipioIbge): string | null {
  return (
    m.microrregiao?.mesorregiao?.UF?.sigla ??
    m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ??
    null
  );
}

async function baixarJson<T>(url: string, descricao: string): Promise<T> {
  return tentarComEspera(
    async () => {
      const resposta = await fetch(url, {
        headers: { 'User-Agent': 'MapaDeCampanha/1.0 (carregar-municipios)' },
      });
      if (!resposta.ok) {
        throw new Error(`${descricao}: HTTP ${resposta.status} ${resposta.statusText}`);
      }
      return (await resposta.json()) as T;
    },
    {
      aoFalhar: (erro, tentativa, espera) =>
        registrar(`  falha em ${descricao} (tentativa ${tentativa}): ${(erro as Error).message}; esperando ${espera / 1000}s`),
    },
  );
}

/** Indice codigo IBGE -> { nome, uf } */
async function indiceDeNomes(arquivoNomes?: string): Promise<Map<number, { nome: string; uf: string }>> {
  let lista: MunicipioIbge[];

  if (arquivoNomes) {
    registrar(`Lendo a lista de municipios de ${arquivoNomes}`);
    lista = JSON.parse(await readFile(arquivoNomes, 'utf8')) as MunicipioIbge[];
  } else {
    registrar('Baixando a lista de municipios do IBGE...');
    lista = await baixarJson<MunicipioIbge[]>(IBGE_MUNICIPIOS, 'lista de municipios');
  }
  const indice = new Map<number, { nome: string; uf: string }>();

  for (const m of lista) {
    const uf = ufDoMunicipio(m);
    if (!uf) {
      registrar(`  aviso: municipio ${m.id} (${m.nome}) sem UF na resposta do IBGE; ignorado`);
      continue;
    }
    indice.set(m.id, { nome: m.nome, uf });
  }

  registrar(`  ${indice.size} municipios na lista do IBGE`);
  return indice;
}

function extrairCodigo(feature: Feature): number | null {
  const props = feature.properties ?? {};
  const bruto = props.codarea ?? props.CD_MUN ?? props.codigo ?? props.id;
  const codigo = Number(String(bruto ?? '').trim());
  return Number.isInteger(codigo) && codigo >= 1000000 && codigo <= 9999999 ? codigo : null;
}

async function main(): Promise<void> {
  const args = lerArgumentos();
  const dryRun = args['dry-run'] === true;
  const supabase = dryRun ? null : clienteServico();

  // Nomes e UFs vem da lista de municipios do IBGE (ou de --nomes, nos testes);
  // a malha traz somente o codigo de cada area.
  const arquivoNomes = typeof args.nomes === 'string' ? args.nomes : undefined;
  const indice = await indiceDeNomes(arquivoNomes);

  const colecoes: Array<{ rotulo: string; features: Feature[] }> = [];

  if (typeof args.arquivo === 'string') {
    registrar(`Lendo malha do arquivo ${args.arquivo}`);
    const bruto = JSON.parse(await readFile(args.arquivo, 'utf8')) as { features: Feature[] };
    colecoes.push({ rotulo: args.arquivo, features: bruto.features ?? [] });
  } else {
    const ufs = typeof args.uf === 'string' ? [args.uf.toUpperCase()] : UFS;
    for (const uf of ufs) {
      if (!UFS.includes(uf)) throw new Error(`UF desconhecida: ${uf}`);
      const url = `${IBGE_MALHA}/${uf}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`;
      registrar(`Baixando a malha de ${uf}...`);
      const colecao = await baixarJson<{ features: Feature[] }>(url, `malha de ${uf}`);
      registrar(`  ${colecao.features.length} municipios em ${uf}`);
      colecoes.push({ rotulo: uf, features: colecao.features });
      await esperar(1000); // uso cordial da API do IBGE
    }
  }

  let totalInseridos = 0;
  let totalAtualizados = 0;
  let totalSemNome = 0;

  for (const colecao of colecoes) {
    const itens: Array<{ id: number; nome: string; uf: string; geometria: unknown }> = [];

    for (const feature of colecao.features) {
      const codigo = extrairCodigo(feature);
      if (codigo === null) {
        registrar(`  aviso: feature sem codigo IBGE valido em ${colecao.rotulo}; ignorada`);
        continue;
      }
      const dados = indice.get(codigo);
      if (!dados) {
        totalSemNome += 1;
        registrar(`  aviso: municipio ${codigo} sem nome na lista do IBGE; ignorado`);
        continue;
      }
      itens.push({ id: codigo, nome: dados.nome, uf: dados.uf, geometria: feature.geometry });
    }

    if (dryRun) {
      registrar(`[dry-run] ${colecao.rotulo}: ${itens.length} municipios seriam gravados`);
      continue;
    }

    for (let i = 0; i < itens.length; i += LOTE) {
      const lote = itens.slice(i, i + LOTE);
      const { data, error } = await supabase!.rpc('carregar_municipios', {
        p_dados: lote,
        p_tolerancia: TOLERANCIA,
      });
      if (error) throw new Error(`gravando ${colecao.rotulo}: ${error.message}`);
      const resumo = (data as Array<{ inseridos: number; atualizados: number }>)[0];
      totalInseridos += resumo.inseridos;
      totalAtualizados += resumo.atualizados;
      registrar(`  ${colecao.rotulo}: +${resumo.inseridos} novos, ${resumo.atualizados} atualizados`);
    }
  }

  registrar('--------------------------------------------------');
  registrar(`Resumo: ${totalInseridos} inseridos, ${totalAtualizados} atualizados, ${totalSemNome} sem nome.`);
  if (dryRun) registrar('Nada foi gravado (--dry-run).');
}

main().catch((erro) => {
  console.error('\nErro:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
