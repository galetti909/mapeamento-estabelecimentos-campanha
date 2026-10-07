#!/usr/bin/env node
/**
 * Verificacao do bundle publicado:
 *   1. a chave de servico (service_role) nao aparece em nenhum arquivo;
 *   2. o JavaScript inicial, sem o Leaflet, fica abaixo de 200 KB comprimido;
 *   3. os cabecalhos de seguranca foram gerados em dist/_headers;
 *   4. o credito do OpenStreetMap esta no codigo publicado.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, extname } from 'node:path';
import { config as carregarEnv } from 'dotenv';

// A chave de servico fica no .env local do administrador; sem carrega-lo, a
// comparacao com o valor real nao aconteceria e o teste passaria em falso.
carregarEnv({ quiet: true });

const DIST = 'dist';
const LIMITE_INICIAL_KB = 200;

let falhas = 0;
const falhar = (mensagem) => {
  console.error(`FALHOU: ${mensagem}`);
  falhas += 1;
};
const passar = (mensagem) => console.log(`ok: ${mensagem}`);

function arquivos(pasta) {
  const encontrados = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) encontrados.push(...arquivos(caminho));
    else encontrados.push(caminho);
  }
  return encontrados;
}

let todos;
try {
  todos = arquivos(DIST);
} catch {
  falhar(`a pasta ${DIST} nao existe. Rode "npm run build" antes.`);
  process.exit(1);
}

// ------------------------------------------------- 1. chave de servico ausente
const CHAVE_SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const PADROES_PROIBIDOS = [
  /service_role/,
  // Chave secreta no formato novo. Exige caracteres depois do prefixo: o
  // proprio SDK do Supabase carrega a string "sb_secret_" para reconhecer o
  // formato das chaves, e isso nao e um segredo vazado.
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /SUPABASE_SERVICE_ROLE_KEY/,
];

/**
 * Procura JWTs no texto e decodifica o payload de cada um. Comparar a string
 * codificada nao serve: "service_role" vira base64 diferente conforme a
 * posicao em que comeca dentro do JSON.
 */
function jwtsComServiceRole(conteudo) {
  const achados = [];
  const tokens = conteudo.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g) ?? [];

  for (const token of tokens) {
    const payload = token.split('.')[1];
    if (!payload) continue;
    try {
      const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const claims = JSON.parse(json);
      if (claims.role && claims.role !== 'anon' && claims.role !== 'authenticated') {
        achados.push(`${claims.role} (${token.slice(0, 24)}...)`);
      }
    } catch {
      // Nao era um JWT valido; segue.
    }
  }
  return achados;
}

let vazou = false;
for (const caminho of todos) {
  const conteudo = readFileSync(caminho, 'utf8');

  if (CHAVE_SERVICO && conteudo.includes(CHAVE_SERVICO)) {
    falhar(`a chave de servico aparece em ${caminho}`);
    vazou = true;
  }
  for (const padrao of PADROES_PROIBIDOS) {
    if (padrao.test(conteudo)) {
      falhar(`padrao proibido ${padrao} encontrado em ${caminho}`);
      vazou = true;
    }
  }
  for (const papel of jwtsComServiceRole(conteudo)) {
    falhar(`JWT com papel privilegiado em ${caminho}: ${papel}`);
    vazou = true;
  }
}

if (!CHAVE_SERVICO) {
  falhar('SUPABASE_SERVICE_ROLE_KEY nao esta no ambiente: a comparacao com a chave real nao foi feita. Preencha o .env (ver .env.example).');
}

if (!vazou) passar('a chave de servico nao aparece em nenhum arquivo publicado');

// ---------------------------------- 2. orcamento do JavaScript inicial
const js = todos.filter((c) => extname(c) === '.js');
const iniciais = js.filter((c) => !/leaflet/i.test(c));
const bytes = iniciais.reduce((total, caminho) => total + gzipSync(readFileSync(caminho)).length, 0);
const kb = bytes / 1024;

if (kb > LIMITE_INICIAL_KB) {
  falhar(`JavaScript inicial com ${kb.toFixed(1)} KB comprimido (limite ${LIMITE_INICIAL_KB} KB)`);
} else {
  passar(`JavaScript inicial com ${kb.toFixed(1)} KB comprimido (limite ${LIMITE_INICIAL_KB} KB, Leaflet fora da conta)`);
}

// ------------------------------------------- 3. cabecalhos de seguranca
try {
  const cabecalhos = readFileSync(join(DIST, '_headers'), 'utf8');
  const exigidos = [
    'Content-Security-Policy',
    "default-src 'self'",
    "script-src 'self'",
    'tile.openstreetmap.org',
    'X-Frame-Options: DENY',
    'Referrer-Policy: no-referrer',
  ];
  const faltando = exigidos.filter((t) => !cabecalhos.includes(t));
  if (faltando.length > 0) falhar(`dist/_headers sem: ${faltando.join(', ')}`);
  else passar('dist/_headers traz a CSP e os cabecalhos de seguranca');

  if (/connect-src[^;]*https?:\/\/[^;\s]+/.test(cabecalhos)) {
    passar('a CSP libera o dominio do Supabase em connect-src');
  } else {
    falhar('a CSP nao nomeia o dominio do Supabase em connect-src (VITE_SUPABASE_URL estava definida no build?)');
  }
} catch {
  falhar('dist/_headers nao foi gerado');
}

// -------------------------------------------------- 4. creditos do mapa
const temCredito = todos.some((caminho) =>
  readFileSync(caminho, 'utf8').includes('colaboradores do OpenStreetMap'));
if (temCredito) passar('o credito do OpenStreetMap esta no codigo publicado');
else falhar('o credito do OpenStreetMap nao foi encontrado no codigo publicado');

console.log(falhas === 0 ? '\nVerificacao do bundle: OK' : `\nVerificacao do bundle: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
