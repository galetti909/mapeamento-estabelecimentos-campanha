import { campo, el, mostrarErroCampo } from '../lib/dom.js';
import { avisarErro, avisarSucesso } from '../lib/avisos.js';
import { mensagemDeErro } from '../lib/erros.js';
import { chamarAdminUsuarios } from '../lib/supabase.js';
import { validarSenha } from '../lib/validacao.js';
import { icone } from '../lib/icones.js';

/**
 * Primeira tela depois do login quando trocar_senha esta ligado (senha
 * temporaria definida por um administrador).
 */
export function telaTrocarSenha(obrigatoria: boolean, aoConcluir: () => void): HTMLElement {
  const senha = campo({
    id: 'nova-senha',
    rotulo: 'Nova senha',
    tipo: 'password',
    autocomplete: 'new-password',
    obrigatorio: true,
    dica: 'Pelo menos 10 caracteres.',
  });
  const confirmacao = campo({
    id: 'nova-senha-confirmacao',
    rotulo: 'Repita a nova senha',
    tipo: 'password',
    autocomplete: 'new-password',
    obrigatorio: true,
  });

  const enviar = el('button', { tipo: 'submit', classe: 'botao botao-largo', texto: 'Trocar senha' });

  const form = el('form', { novalidate: true }, senha.bloco, confirmacao.bloco, el('div', { classe: 'acoes' }, enviar));

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarErroCampo(senha.erro, null);
    mostrarErroCampo(confirmacao.erro, null);

    const problemas = validarSenha(senha.entrada.value, confirmacao.entrada.value);
    if (problemas.length > 0) {
      for (const problema of problemas) {
        mostrarErroCampo(problema.campo === 'senha' ? senha.erro : confirmacao.erro, problema.mensagem);
      }
      senha.entrada.focus();
      return;
    }

    enviar.disabled = true;
    enviar.textContent = 'Trocando...';
    try {
      // A Edge Function troca a senha e desliga a marca trocar_senha.
      await chamarAdminUsuarios('trocar_minha_senha', { senha: senha.entrada.value });
      avisarSucesso('Senha trocada.');
      aoConcluir();
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
      enviar.disabled = false;
      enviar.textContent = 'Trocar senha';
    }
  });

  return el(
    'div',
    { classe: obrigatoria ? 'acesso' : 'pagina' },
    obrigatoria
      ? el('div', { classe: 'acesso-marca' },
          el('span', { classe: 'simbolo' }, icone('chave', { tamanho: 24 })),
          el('h2', { texto: 'Escolha uma nova senha' }))
      : el('div', { classe: 'pagina-cabecalho' }, el('h2', { texto: 'Trocar senha' })),
    obrigatoria
      ? el('p', {
          classe: 'sub',
          texto: 'Um administrador definiu uma senha temporária para a sua conta. Escolha uma nova senha para continuar.',
        })
      : null,
    form,
  );
}
