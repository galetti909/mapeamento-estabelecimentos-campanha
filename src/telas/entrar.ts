import { botao, campo, el, mostrarErroCampo, substituir } from '../lib/dom.js';
import { icone } from '../lib/icones.js';
import { avisarErro } from '../lib/avisos.js';
import { mensagemDeErro } from '../lib/erros.js';
import { supabase } from '../lib/supabase.js';
import { validarEmail, validarNomeExibicao, validarSenha } from '../lib/validacao.js';

const AVISO_PRIVACIDADE = [
  'O app guarda o seu e-mail, a sua senha (com hash, pelo Supabase) e o seu nome de exibição.',
  'O seu nome de exibição aparece para outros voluntários liberados na agenda dos locais. O seu e-mail só é visto por administradores.',
  'Nenhum dado das pessoas abordadas é registrado, e o app não envia e-mail nenhum.',
  'A base é apagada até 30 dias depois de 25/10/2026.',
];

/** Tela de entrada com as abas "Entrar" e "Inscrever-se". */
export function telaEntrar(aoEntrar: () => void, aoInscrever?: () => void): HTMLElement {
  const area = el('div', { classe: 'acesso' });

  const abaEntrar = botao('Entrar', () => mostrar('entrar'), { classe: '' });
  const abaInscrever = botao('Inscrever-se', () => mostrar('inscrever'), { classe: '' });
  abaEntrar.setAttribute('role', 'tab');
  abaInscrever.setAttribute('role', 'tab');

  const abas = el('div', { classe: 'abas', role: 'tablist' }, abaEntrar, abaInscrever);
  const corpo = el('div', { role: 'tabpanel' });

  function mostrar(qual: 'entrar' | 'inscrever'): void {
    abaEntrar.setAttribute('aria-selected', String(qual === 'entrar'));
    abaInscrever.setAttribute('aria-selected', String(qual === 'inscrever'));
    substituir(
      corpo,
      qual === 'entrar'
        ? formularioEntrar(aoEntrar)
        : formularioInscrever(aoInscrever ?? (() => mostrar('entrar'))),
    );
  }

  area.append(
    el('div', { classe: 'acesso-marca' },
      el('span', { classe: 'simbolo' }, icone('local', { tamanho: 24 })),
      el('h2', { texto: 'Mapa de Campanha' }),
    ),
    el('p', {
      classe: 'sub',
      texto: 'Voluntários marcam locais com circulação de pessoas e se agendam para ir conversar. '
        + 'O acesso é liberado à mão por um administrador.',
    }),
    abas,
    corpo,
  );

  mostrar('entrar');
  return area;
}

function formularioEntrar(aoEntrar: () => void): HTMLElement {
  const email = campo({ id: 'entrar-email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email', obrigatorio: true });
  const senha = campo({ id: 'entrar-senha', rotulo: 'Senha', tipo: 'password', autocomplete: 'current-password', obrigatorio: true });

  const enviar = el('button', { tipo: 'submit', classe: 'botao botao-largo', texto: 'Entrar' });

  const form = el('form', { novalidate: true }, email.bloco, senha.bloco,
    el('div', { classe: 'acoes' }, enviar));

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarErroCampo(email.erro, null);
    mostrarErroCampo(senha.erro, null);

    const problemasEmail = validarEmail(email.entrada.value);
    if (problemasEmail.length > 0) {
      mostrarErroCampo(email.erro, problemasEmail[0].mensagem);
      email.entrada.focus();
      return;
    }
    if (senha.entrada.value === '') {
      mostrarErroCampo(senha.erro, 'Informe a sua senha.');
      senha.entrada.focus();
      return;
    }

    enviar.disabled = true;
    enviar.textContent = 'Entrando...';
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.entrada.value.trim(),
        password: senha.entrada.value,
      });
      if (error) throw error;
      aoEntrar();
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
      enviar.disabled = false;
      enviar.textContent = 'Entrar';
    }
  });

  return el(
    'div',
    {},
    form,
    el('div', { classe: 'caixa caixa-icone', style: 'margin-top: var(--e6)' },
      icone('chave', { tamanho: 18 }),
      el('div', {},
        el('h3', { texto: 'Esqueci a senha' }),
        el('p', {
          classe: 'texto-fraco',
          texto: 'O app não envia e-mails, então não há recuperação automática. Peça a um administrador do grupo, por fora do app, que defina uma senha temporária. Na primeira entrada com ela, você escolhe uma nova.',
        }),
      ),
    ),
  );
}

function formularioInscrever(aoConcluir: () => void): HTMLElement {
  const email = campo({ id: 'inscrever-email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email', obrigatorio: true });
  const nome = campo({
    id: 'inscrever-nome',
    rotulo: 'Nome de exibição',
    maxlength: 40,
    obrigatorio: true,
    dica: 'De 2 a 40 caracteres. É o único dado seu que outros voluntários veem, na agenda dos locais.',
  });
  const senha = campo({
    id: 'inscrever-senha',
    rotulo: 'Senha',
    tipo: 'password',
    autocomplete: 'new-password',
    obrigatorio: true,
    dica: 'Pelo menos 10 caracteres.',
  });
  const confirmacao = campo({
    id: 'inscrever-confirmacao',
    rotulo: 'Repita a senha',
    tipo: 'password',
    autocomplete: 'new-password',
    obrigatorio: true,
  });

  const li = el('input', { tipo: 'checkbox', id: 'inscrever-aviso' });
  const erroAviso = el('p', { classe: 'campo-erro', role: 'alert', hidden: true });

  const blocoAviso = el(
    'div',
    { classe: 'caixa caixa-info' },
    el('h3', {}, icone('cadeado', { tamanho: 16 }), document.createTextNode(' Aviso de privacidade')),
    el('ul', {}, ...AVISO_PRIVACIDADE.map((texto) => el('li', { texto }))),
    el('div', { classe: 'selecionar-todos' }, li, el('label', { for: 'inscrever-aviso', texto: 'Li e entendi o aviso de privacidade.' })),
    erroAviso,
  );

  const enviar = el('button', { tipo: 'submit', classe: 'botao botao-largo', texto: 'Inscrever-se' });

  const form = el(
    'form',
    { novalidate: true },
    email.bloco,
    nome.bloco,
    senha.bloco,
    confirmacao.bloco,
    blocoAviso,
    el('div', { classe: 'acoes' }, enviar),
  );

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    for (const c of [email, nome, senha, confirmacao]) mostrarErroCampo(c.erro, null);
    mostrarErroCampo(erroAviso, null);

    const problemas = [
      ...validarEmail(email.entrada.value).map((p) => ({ ...p, campo: 'email' })),
      ...validarNomeExibicao(nome.entrada.value),
      ...validarSenha(senha.entrada.value, confirmacao.entrada.value),
    ];

    const mapa: Record<string, { erro: HTMLElement; entrada: HTMLElement }> = {
      email: { erro: email.erro, entrada: email.entrada },
      nome_exibicao: { erro: nome.erro, entrada: nome.entrada },
      senha: { erro: senha.erro, entrada: senha.entrada },
      confirmacao: { erro: confirmacao.erro, entrada: confirmacao.entrada },
    };

    if (problemas.length > 0) {
      for (const problema of problemas) {
        const destino = mapa[problema.campo];
        if (destino) mostrarErroCampo(destino.erro, problema.mensagem);
      }
      mapa[problemas[0].campo]?.entrada.focus();
      return;
    }

    if (!li.checked) {
      mostrarErroCampo(erroAviso, 'Marque que você leu o aviso de privacidade.');
      li.focus();
      return;
    }

    enviar.disabled = true;
    enviar.textContent = 'Enviando...';
    try {
      const { error } = await supabase.auth.signUp({
        email: email.entrada.value.trim(),
        password: senha.entrada.value,
        options: { data: { nome_exibicao: nome.entrada.value.trim() } },
      });
      if (error) throw error;

      // Nenhum e-mail e enviado: a conta nasce aguardando liberacao. A
      // inscricao pelo Supabase Auth ja abre uma sessao, que e encerrada
      // aqui: quem decide o que acontece a seguir e quem chamou a tela.
      await supabase.auth.signOut();
      aoConcluir();
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
      enviar.disabled = false;
      enviar.textContent = 'Inscrever-se';
    }
  });

  return el('div', {}, form);
}
