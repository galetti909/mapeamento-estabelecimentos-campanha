import './estilos/estilo.css';

import { botao, el, substituir } from './lib/dom.js';
import { icone, type NomeIcone } from './lib/icones.js';
import { avisarErro } from './lib/avisos.js';
import { mensagemDeErro } from './lib/erros.js';
import { carregarSessao, estado, sair, souAdmin } from './lib/sessao.js';
import { supabase } from './lib/supabase.js';
import { telaAdmin } from './telas/admin.js';
import { telaAguardando } from './telas/aguardando.js';
import { telaEntrar } from './telas/entrar.js';
import { telaMapa } from './telas/mapa.js';
import { telaMeusAgendamentos } from './telas/meus-agendamentos.js';
import { telaRegras } from './telas/regras.js';
import { telaTrocarSenha } from './telas/trocar-senha.js';

const conteudo = document.getElementById('conteudo') as HTMLElement;
const cabecalho = document.getElementById('cabecalho') as HTMLElement;
const menu = document.getElementById('menu') as HTMLElement;
const abrirMenu = document.getElementById('abrir-menu') as HTMLButtonElement;
const contadorAdmin = document.getElementById('contador-admin') as HTMLElement;
const faixaLeitura = document.getElementById('faixa-somente-leitura') as HTMLElement;
const menuFundo = document.getElementById('menu-fundo') as HTMLElement;

// O botão do menu e a marca do cabeçalho recebem seus ícones uma vez só.
abrirMenu.append(icone('menu', { tamanho: 22 }));
cabecalho.querySelector('.cabecalho-marca')?.prepend(icone('local', { tamanho: 18 }));

type Rota =
  | { nome: 'mapa'; localId?: string }
  | { nome: 'meus-agendamentos' }
  | { nome: 'regras' }
  | { nome: 'trocar-senha' }
  | { nome: 'admin'; secao: 'contas' | 'pedidos' | 'historico' | 'controle' };

function lerRota(): Rota {
  const bruto = (location.hash || '#/mapa').replace(/^#\/?/, '');
  const partes = bruto.split('/').filter(Boolean);

  switch (partes[0]) {
    case 'meus-agendamentos':
      return { nome: 'meus-agendamentos' };
    case 'regras':
      return { nome: 'regras' };
    case 'trocar-senha':
      return { nome: 'trocar-senha' };
    case 'admin': {
      const secao = partes[1];
      if (secao === 'pedidos' || secao === 'historico' || secao === 'controle') {
        return { nome: 'admin', secao };
      }
      return { nome: 'admin', secao: 'contas' };
    }
    default:
      return partes[1] ? { nome: 'mapa', localId: partes[1] } : { nome: 'mapa' };
  }
}

function irPara(hash: string): void {
  if (location.hash === hash) desenhar();
  else location.hash = hash;
}

// ---------------------------------------------------------------------- menu
function fecharMenu(): void {
  menu.hidden = true;
  menuFundo.hidden = true;
  abrirMenu.setAttribute('aria-expanded', 'false');
}

function alternarMenu(): void {
  const abrindo = menu.hidden;
  menu.hidden = !abrindo;
  menuFundo.hidden = !abrindo;
  abrirMenu.setAttribute('aria-expanded', String(abrindo));
  if (abrindo) menu.querySelector<HTMLElement>('a, button')?.focus();
}

abrirMenu.addEventListener('click', alternarMenu);
menuFundo.addEventListener('click', fecharMenu);

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && !menu.hidden) {
    fecharMenu();
    abrirMenu.focus();
  }
});

function itemMenu(
  rotulo: string,
  hash: string,
  nomeIcone: NomeIcone,
  atual: boolean,
  contador?: number,
): HTMLElement {
  const link = el(
    'a',
    { href: hash },
    icone(nomeIcone),
    el('span', { classe: 'menu-rotulo', texto: rotulo }),
    contador && contador > 0
      ? el('span', { classe: 'cabecalho-contador', texto: String(contador) })
      : null,
  );
  if (atual) link.setAttribute('aria-current', 'page');
  link.addEventListener('click', fecharMenu);
  return link;
}

/** Iniciais do nome de exibição, para o avatar do rodapé do menu. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

let contadores = { contas_aguardando: 0, pedidos_abertos: 0 };

async function carregarContadores(): Promise<void> {
  if (!souAdmin()) {
    contadores = { contas_aguardando: 0, pedidos_abertos: 0 };
    contadorAdmin.hidden = true;
    return;
  }

  const { data, error } = await supabase.rpc('admin_contadores');
  if (error) return;

  contadores = ((data as Array<typeof contadores>) ?? [])[0] ?? contadores;
  const total = contadores.contas_aguardando + contadores.pedidos_abertos;
  contadorAdmin.textContent = String(total);
  contadorAdmin.hidden = total === 0;
  contadorAdmin.setAttribute(
    'aria-label',
    `${contadores.contas_aguardando} conta(s) e ${contadores.pedidos_abertos} pedido(s) aguardando`,
  );
  desenharMenu();
}

function desenharMenu(): void {
  const rota = lerRota();
  const atual = (nome: string, secao?: string) =>
    rota.nome === nome && (secao === undefined || (rota as { secao?: string }).secao === secao);

  const sair = botao('', () => void encerrar(), { classe: 'botao-sutil botao-largo' });
  sair.append(icone('sair', { tamanho: 18 }), el('span', { texto: 'Sair' }));

  substituir(
    menu,
    itemMenu('Mapa', '#/mapa', 'mapa', atual('mapa')),
    itemMenu('Meus agendamentos', '#/meus-agendamentos', 'calendario', atual('meus-agendamentos')),
    itemMenu('Regras de conduta', '#/regras', 'livro', atual('regras')),

    souAdmin() ? el('div', { classe: 'menu-separador' }) : null,
    souAdmin() ? itemMenu('Contas', '#/admin/contas', 'pessoas', atual('admin', 'contas'), contadores.contas_aguardando) : null,
    souAdmin() ? itemMenu('Pedidos de limite', '#/admin/pedidos', 'mao', atual('admin', 'pedidos'), contadores.pedidos_abertos) : null,
    souAdmin() ? itemMenu('Histórico', '#/admin/historico', 'historico', atual('admin', 'historico')) : null,
    souAdmin() ? itemMenu('Controle', '#/admin/controle', 'controle', atual('admin', 'controle')) : null,

    el('div', { classe: 'menu-separador' }),
    itemMenu('Trocar minha senha', '#/trocar-senha', 'chave', atual('trocar-senha')),

    el('div', { classe: 'menu-rodape' },
      el('div', { classe: 'menu-identidade-linha' },
        el('span', { classe: 'avatar', texto: iniciais(estado.perfil?.nome_exibicao ?? '') }),
        el('span', { classe: 'menu-identidade' },
          el('strong', { texto: estado.perfil?.nome_exibicao ?? '' }),
          el('span', { texto: estado.email ?? '' }),
        ),
      ),
      sair,
    ),
  );
}

async function encerrar(): Promise<void> {
  inscricaoEnviada = false;
  await sair();
  fecharMenu();
  irPara('#/mapa');
  desenhar();
}

// -------------------------------------------------------------------- faixas
function atualizarFaixaLeitura(): void {
  const ligado = estado.config?.somente_leitura ?? false;
  faixaLeitura.hidden = !ligado;
  if (ligado) {
    substituir(
      faixaLeitura,
      icone('cadeado', { tamanho: 16 }),
      el('span', { texto: 'Somente leitura: nenhuma marcação ou agendamento pode ser feito agora.' }),
    );
  } else {
    substituir(faixaLeitura);
  }
}

window.addEventListener('config-mudou', () => {
  atualizarFaixaLeitura();
});

// ------------------------------------------------------------------ desenho
/** Ligado logo depois de uma inscricao, para mostrar a tela de confirmacao. */
let inscricaoEnviada = false;

function telaInscricaoEnviada(): HTMLElement {
  return el(
    'div',
    { classe: 'acesso' },
    el('div', { classe: 'acesso-marca' },
      el('span', { classe: 'simbolo' }, icone('check', { tamanho: 24 })),
      el('h2', { texto: 'Inscrição enviada' }),
    ),
    el('p', {
      classe: 'sub',
      texto: 'Sua conta está aguardando liberação. Um administrador vai analisar o pedido. '
        + 'Se quiser, fale com alguém do grupo por fora do app: o sistema não envia e-mails.',
    }),
    el('div', { classe: 'acoes' },
      botao('Voltar para o início', () => {
        inscricaoEnviada = false;
        desenhar();
      }, { classe: 'botao botao-largo' }),
    ),
  );
}

function desenhar(): void {
  const rota = lerRota();

  // Sem login: so a tela de entrada (ou a confirmacao da inscricao).
  if (!estado.usuarioId) {
    cabecalho.hidden = true;
    fecharMenu();
    faixaLeitura.hidden = true;
    substituir(
      conteudo,
      inscricaoEnviada
        ? telaInscricaoEnviada()
        : telaEntrar(() => void recarregar(), () => {
            inscricaoEnviada = true;
            desenhar();
          }),
    );
    return;
  }

  // Conta nao liberada: nenhuma outra tela fica acessivel.
  const status = estado.perfil?.status ?? 'aguardando';
  if (status !== 'ativo') {
    cabecalho.hidden = true;
    fecharMenu();
    faixaLeitura.hidden = true;
    substituir(conteudo, telaAguardando(status, estado.email, () => void encerrar()));
    return;
  }

  cabecalho.hidden = false;
  atualizarFaixaLeitura();
  desenharMenu();

  // Senha temporaria: a troca vem antes de tudo.
  if (estado.perfil?.trocar_senha && rota.nome !== 'trocar-senha') {
    substituir(conteudo, telaTrocarSenha(true, () => void recarregar()));
    return;
  }

  switch (rota.nome) {
    case 'meus-agendamentos':
      substituir(conteudo, telaMeusAgendamentos((localId) => irPara(`#/mapa/${localId}`)));
      break;
    case 'regras':
      substituir(conteudo, telaRegras());
      break;
    case 'trocar-senha':
      substituir(conteudo, telaTrocarSenha(estado.perfil?.trocar_senha ?? false, () => void recarregar()));
      break;
    case 'admin':
      if (!souAdmin()) {
        irPara('#/mapa');
        return;
      }
      substituir(conteudo, telaAdmin(rota.secao, () => void carregarContadores()));
      break;
    default:
      substituir(conteudo, telaMapa(rota.localId));
      break;
  }
}

async function recarregar(): Promise<void> {
  await carregarSessao();
  desenhar();
  void carregarContadores();
}

window.addEventListener('hashchange', () => {
  fecharMenu();
  desenhar();
});

supabase.auth.onAuthStateChange((evento) => {
  // A inscricao tambem dispara SIGNED_OUT (a sessao recem-aberta e encerrada
  // de proposito). Redesenhar ali apagaria a tela de confirmacao, por isso o
  // redesenho so vale quando havia uma sessao de verdade.
  if (evento === 'SIGNED_OUT' && estado.usuarioId) {
    void recarregar();
  }
});

async function iniciar(): Promise<void> {
  substituir(
    conteudo,
    el('div', { classe: 'pagina' },
      el('div', { classe: 'esqueleto' },
        el('div', { classe: 'esqueleto-linha' }),
        el('div', { classe: 'esqueleto-linha' }),
        el('div', { classe: 'esqueleto-linha' }),
      ),
    ),
  );
  try {
    await carregarSessao();
    desenhar();
    void carregarContadores();
  } catch (erro) {
    substituir(
      conteudo,
      el('div', { classe: 'pagina' },
        el('div', { classe: 'caixa caixa-erro' },
          el('h2', { texto: 'Não foi possível iniciar o app' }),
          el('p', { texto: mensagemDeErro(erro) }))),
    );
    avisarErro(mensagemDeErro(erro));
  }
}

void iniciar();
