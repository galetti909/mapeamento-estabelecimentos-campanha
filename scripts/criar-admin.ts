#!/usr/bin/env tsx
/**
 * criar-admin.ts - cria o primeiro administrador.
 *
 * Como o app nao confirma e-mail, qualquer pessoa poderia se inscrever com o
 * e-mail do dono do projeto. Por isso o primeiro administrador NAO e definido
 * pelo e-mail na inscricao: este script, rodado com a chave de servico logo
 * depois da publicacao e ANTES de divulgar o link, cria a conta ja como
 * administrador ativo. A senha e digitada no terminal e nao fica em arquivo.
 *
 * Rodar de novo nao duplica: so garante papel 'admin' e status 'ativo'.
 *
 * Uso:
 *   npm run criar-admin
 *   npm run criar-admin -- --email outra@pessoa.org --nome "Outro Nome"
 *   ADMIN_SENHA=... npm run criar-admin        (para automacao/testes)
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { clienteServico, lerArgumentos, registrar } from './lib/ambiente.js';

const MINIMO_SENHA = 10;

async function pedirSenha(): Promise<string> {
  if (process.env.ADMIN_SENHA) return process.env.ADMIN_SENHA;

  const leitor = createInterface({ input: stdin, output: stdout, terminal: true });
  try {
    const senha = await leitor.question(`Senha do administrador (minimo ${MINIMO_SENHA} caracteres): `);
    const confirmacao = await leitor.question('Repita a senha: ');
    if (senha !== confirmacao) throw new Error('As duas senhas nao sao iguais.');
    if (senha.length < MINIMO_SENHA) {
      throw new Error(`A senha precisa ter pelo menos ${MINIMO_SENHA} caracteres.`);
    }
    return senha;
  } finally {
    leitor.close();
  }
}

async function main(): Promise<void> {
  const args = lerArgumentos();
  const email = String(args.email ?? process.env.ADMIN_EMAIL ?? 'joaogaletti@gmail.com').trim().toLowerCase();
  const nome = String(args.nome ?? process.env.ADMIN_NOME_EXIBICAO ?? 'Joao Galetti').trim();

  const supabase = clienteServico();

  // Procura a conta pelo e-mail nas paginas de auth.users.
  let usuarioId: string | null = null;
  for (let pagina = 1; pagina <= 50 && !usuarioId; pagina += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw new Error(`listando usuarios: ${error.message}`);
    if (data.users.length === 0) break;
    usuarioId = data.users.find((u) => (u.email ?? '').toLowerCase() === email)?.id ?? null;
  }

  if (usuarioId) {
    registrar(`A conta ${email} ja existe (${usuarioId}).`);
    const trocar = args['trocar-senha'] === true;
    if (trocar) {
      const senha = await pedirSenha();
      const { error } = await supabase.auth.admin.updateUserById(usuarioId, { password: senha });
      if (error) throw new Error(`trocando a senha: ${error.message}`);
      registrar('Senha atualizada.');
    } else {
      registrar('Senha mantida. Use --trocar-senha para definir uma nova.');
    }
  } else {
    const senha = await pedirSenha();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true, // nenhum e-mail e enviado; a conta nasce confirmada
      user_metadata: { nome_exibicao: nome },
    });
    if (error) throw new Error(`criando a conta: ${error.message}`);
    usuarioId = data.user.id;
    registrar(`Conta ${email} criada (${usuarioId}).`);
  }

  const { data: perfil, error: erroPerfil } = await supabase.rpc('criar_admin_inicial', {
    p_id: usuarioId,
    p_nome_exibicao: nome,
  });
  if (erroPerfil) throw new Error(`promovendo a administrador: ${erroPerfil.message}`);

  const p = perfil as { nome_exibicao: string; papel: string; status: string };
  registrar('--------------------------------------------------');
  registrar(`Administrador pronto: ${email}`);
  registrar(`  nome de exibicao: ${p.nome_exibicao}`);
  registrar(`  papel: ${p.papel} | status: ${p.status}`);
  registrar('Agora o link pode ser divulgado.');
}

main().catch((erro) => {
  console.error('\nErro:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
