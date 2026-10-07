// ===========================================================================
// Edge Function admin-usuarios
//
// Existe por um motivo so: definir a senha temporaria de um usuario exige a
// chave de servico, e a chave de servico NUNCA pode ir ao navegador. A funcao
// confirma, pelo token de quem chama, que e um administrador ativo, e so
// depois usa a chave.
//
// Segredos (nao variaveis do site):
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
// SUPABASE_URL e SUPABASE_ANON_KEY ja sao injetados pela plataforma.
//
// Acoes:
//   { acao: "definir_senha_temporaria", perfil_id, senha }
//   { acao: "trocar_minha_senha", senha }
// ===========================================================================

import { createClient } from '@supabase/supabase-js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MINIMO_SENHA = 10;

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function erro(codigo: string, status: number): Response {
  return resposta({ erro: codigo }, status);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro('metodo_nao_permitido', 405);

  const url = Deno.env.get('SUPABASE_URL');
  const chaveAnon = Deno.env.get('SUPABASE_ANON_KEY');
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !chaveAnon || !chaveServico) {
    console.error('Faltam SUPABASE_URL, SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY.');
    return erro('configuracao_incompleta', 500);
  }

  const autorizacao = req.headers.get('Authorization') ?? '';
  if (!autorizacao.toLowerCase().startsWith('bearer ')) return erro('sem_login', 401);

  // Cliente com o token de quem chamou: descobre quem e a pessoa.
  const comoUsuario = createClient(url, chaveAnon, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  });

  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser();
  if (erroSessao || !sessao.user) return erro('sem_login', 401);

  const quemChama = sessao.user.id;

  let corpo: { acao?: string; perfil_id?: string; senha?: string };
  try {
    corpo = await req.json();
  } catch {
    return erro('corpo_invalido', 400);
  }

  const senha = corpo.senha ?? '';
  if (senha.length < MINIMO_SENHA) return erro('weak_password', 400);

  const comChaveServico = createClient(url, chaveServico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- trocar a propria senha --------------------------------------------
  // Fecha o ciclo da senha temporaria: o usuario define a senha definitiva e
  // o banco desliga a marca trocar_senha.
  if (corpo.acao === 'trocar_minha_senha') {
    // auth.updateUser() do SDK exige uma sessao guardada no cliente, que nao
    // existe aqui. O endpoint do GoTrue e chamado direto com o token de quem
    // pediu a troca.
    const troca = await fetch(`${url}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: chaveAnon,
        Authorization: autorizacao,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: senha }),
    });

    if (!troca.ok) {
      const detalhe = await troca.text();
      console.error('trocar_minha_senha:', troca.status, detalhe);
      let codigo = 'falha_ao_trocar_senha';
      try {
        const corpoErro = JSON.parse(detalhe) as { error_code?: string; code?: string };
        codigo = corpoErro.error_code ?? corpoErro.code ?? codigo;
      } catch {
        // Resposta sem JSON: fica o codigo generico.
      }
      return erro(codigo, 400);
    }

    const { error: erroMarca } = await comoUsuario.rpc('trocar_minha_senha_concluida');
    if (erroMarca) return erro(erroMarca.message, 400);

    return resposta({ ok: true });
  }

  // --- definir senha temporaria de outra conta ---------------------------
  if (corpo.acao === 'definir_senha_temporaria') {
    // Confere o papel pelo banco, nunca pelo que o navegador afirma.
    const { data: perfilQuemChama, error: erroPerfil } = await comChaveServico
      .from('perfis')
      .select('papel, status')
      .eq('id', quemChama)
      .maybeSingle();

    if (erroPerfil) return erro('falha_ao_conferir_papel', 500);
    if (!perfilQuemChama || perfilQuemChama.papel !== 'admin' || perfilQuemChama.status !== 'ativo') {
      return erro('somente_admin', 403);
    }

    const alvo = corpo.perfil_id ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(alvo)) return erro('perfil_nao_encontrado', 400);
    if (alvo === quemChama) return erro('nao_pode_agir_sobre_si', 400);

    const { data: perfilAlvo } = await comChaveServico
      .from('perfis')
      .select('id')
      .eq('id', alvo)
      .maybeSingle();
    if (!perfilAlvo) return erro('perfil_nao_encontrado', 404);

    const { error: erroSenha } = await comChaveServico.auth.admin.updateUserById(alvo, {
      password: senha,
    });
    if (erroSenha) return erro(erroSenha.code ?? 'falha_ao_trocar_senha', 400);

    // Obriga a troca no proximo login.
    const { error: erroMarca } = await comChaveServico
      .from('perfis')
      .update({ trocar_senha: true })
      .eq('id', alvo);
    if (erroMarca) return erro('falha_ao_marcar_troca', 500);

    return resposta({ ok: true });
  }

  return erro('acao_desconhecida', 400);
});
