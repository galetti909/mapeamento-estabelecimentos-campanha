#!/usr/bin/env tsx
/**
 * importar-csv.ts - importa locais de CSV de dados abertos (listas de feiras
 * livres de prefeituras, por exemplo).
 *
 * Colunas esperadas: nome, tipo, lat, lng, endereco, id_externo
 * Os registros entram com origem='dados_abertos' e seguem as mesmas regras de
 * upsert da importacao do OSM (ver importar-osm.ts).
 *
 * Uso:
 *   npm run importar-csv -- --arquivo feiras-sp.csv
 *   npm run importar-csv -- --arquivo feiras-sp.csv --dry-run
 */

import { readFile } from 'node:fs/promises';
import { clienteServico, lerArgumentos, registrar } from './lib/ambiente.js';
import { lerCsv } from './lib/csv.js';
import { TIPOS_LOCAL, type TipoLocal } from './lib/mapeamento-osm.js';

const LOTE = 300;

export interface LinhaCsv {
  nome?: string;
  tipo?: string;
  lat?: string;
  lng?: string;
  endereco?: string;
  id_externo?: string;
}

export interface ConversaoCsv {
  local: {
    origem_id: string;
    nome: string;
    tipo: TipoLocal;
    lat: number;
    lng: number;
    endereco: string | null;
  } | null;
  erro: string | null;
}

export function converterLinha(linha: LinhaCsv, numeroLinha: number): ConversaoCsv {
  const nome = (linha.nome ?? '').trim();
  const tipoBruto = (linha.tipo ?? '').trim().toLowerCase();
  // Number('') e 0, que seria aceito como coordenada: campo vazio tem de
  // virar NaN para cair na checagem abaixo.
  const numero = (bruto: string | undefined): number => {
    const texto = (bruto ?? '').trim().replace(',', '.');
    return texto === '' ? Number.NaN : Number(texto);
  };
  const lat = numero(linha.lat);
  const lng = numero(linha.lng);
  const idExterno = (linha.id_externo ?? '').trim();

  if ([...nome].length < 2) return { local: null, erro: `linha ${numeroLinha}: nome ausente ou curto` };
  if (!TIPOS_LOCAL.includes(tipoBruto as TipoLocal)) {
    return { local: null, erro: `linha ${numeroLinha}: tipo "${tipoBruto}" nao existe` };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { local: null, erro: `linha ${numeroLinha}: lat/lng invalidos` };
  }
  if (idExterno === '') return { local: null, erro: `linha ${numeroLinha}: id_externo ausente` };

  return {
    local: {
      origem_id: idExterno,
      nome: nome.slice(0, 80),
      tipo: tipoBruto as TipoLocal,
      lat,
      lng,
      endereco: (linha.endereco ?? '').trim().slice(0, 160) || null,
    },
    erro: null,
  };
}

async function main(): Promise<void> {
  const args = lerArgumentos();
  const dryRun = args['dry-run'] === true;

  if (typeof args.arquivo !== 'string') {
    throw new Error('Informe --arquivo <caminho do CSV>.');
  }

  const registros = lerCsv(await readFile(args.arquivo, 'utf8'));
  registrar(`${registros.length} linhas em ${args.arquivo}`);

  const locais: NonNullable<ConversaoCsv['local']>[] = [];
  const problemas: string[] = [];
  const vistos = new Set<string>();

  registros.forEach((registro, i) => {
    const { local, erro } = converterLinha(registro as LinhaCsv, i + 2);
    if (!local) {
      problemas.push(erro as string);
      return;
    }
    if (vistos.has(local.origem_id)) {
      problemas.push(`linha ${i + 2}: id_externo repetido (${local.origem_id})`);
      return;
    }
    vistos.add(local.origem_id);
    locais.push(local);
  });

  for (const problema of problemas) registrar(`  ignorada: ${problema}`);

  if (dryRun) {
    registrar(`[dry-run] ${locais.length} locais seriam gravados; ${problemas.length} linhas ignoradas.`);
    registrar('Nada foi gravado (--dry-run).');
    return;
  }

  const supabase = clienteServico();
  const total = { novos: 0, atualizados: 0, preservados: 0, ignorados: 0 };

  for (let i = 0; i < locais.length; i += LOTE) {
    const lote = locais.slice(i, i + LOTE);
    const { data, error } = await supabase.rpc('importar_locais', {
      p_origem: 'dados_abertos',
      p_acao: 'importar_csv',
      p_registro_id: args.arquivo,
      p_dados: lote,
    });
    if (error) throw new Error(`gravando: ${error.message}`);
    const r = (data as Array<{
      novos: number; atualizados: number; preservados: number; ignorados: number; erros: unknown[];
    }>)[0];
    total.novos += r.novos;
    total.atualizados += r.atualizados;
    total.preservados += r.preservados;
    total.ignorados += r.ignorados;
    for (const erro of r.erros as Array<{ nome: string; erro: string }>) {
      registrar(`  ignorado: ${erro.nome} - ${erro.erro}`);
    }
  }

  registrar('--------------------------------------------------');
  registrar(
    `Resumo: +${total.novos} novos, ${total.atualizados} atualizados, ` +
      `${total.preservados} com status preservado, ${total.ignorados} ignorados pelo banco, ` +
      `${problemas.length} linhas invalidas.`,
  );
}

// Executa somente quando chamado direto (o modulo tambem e usado nos testes).
if (process.argv[1]?.includes('importar-csv')) {
  main().catch((erro) => {
    console.error('\nErro:', erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
}
