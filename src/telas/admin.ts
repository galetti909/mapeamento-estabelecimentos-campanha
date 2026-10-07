import { botao, campo, el, mostrarErroCampo, selecao, substituir } from '../lib/dom.js';
import { avisar, avisarErro, avisarSucesso } from '../lib/avisos.js';
import { formatarMomento } from '../lib/datas.js';
import { mensagemDeErro } from '../lib/erros.js';
import { ROTULO_ACAO, ROTULO_PAPEL, ROTULO_STATUS_CONTA, ROTULO_TABELA } from '../lib/rotulos.js';
import { carregarSessao, estado } from '../lib/sessao.js';
import { chamarAdminUsuarios, supabase } from '../lib/supabase.js';
import type { ContaAdmin, LinhaHistorico, PedidoAdmin, StatusConta } from '../lib/tipos.js';
import { validarMotivoArquivamento, validarSenha } from '../lib/validacao.js';
import { icone } from '../lib/icones.js';
import { menuDeAcoes } from '../lib/menu-acoes.js';
import { abrirModal } from '../lib/modal.js';
import { escreverCsvCliente, baixarArquivo } from '../lib/exportacao.js';

type Secao = 'contas' | 'pedidos' | 'historico' | 'controle';

export function telaAdmin(secao: Secao, aoAtualizarContadores: () => void): HTMLElement {
  const corpo = el('div');
  const area = el('div', { classe: 'pagina' }, corpo);

  switch (secao) {
    case 'pedidos':
      substituir(corpo, secaoPedidos(aoAtualizarContadores));
      break;
    case 'historico':
      substituir(corpo, secaoHistorico());
      break;
    case 'controle':
      substituir(corpo, secaoControle());
      break;
    default:
      substituir(corpo, secaoContas(aoAtualizarContadores));
  }

  return area;
}

// ===========================================================================
// Contas
// ===========================================================================
const ABAS: Array<{ status: StatusConta; rotulo: string }> = [
  { status: 'aguardando', rotulo: 'Aguardando' },
  { status: 'ativo', rotulo: 'Ativas' },
  { status: 'recusado', rotulo: 'Recusadas' },
  { status: 'bloqueado', rotulo: 'Bloqueadas' },
];

function secaoContas(aoAtualizarContadores: () => void): HTMLElement {
  let statusAtual: StatusConta = 'aguardando';
  let contas: ContaAdmin[] = [];
  const selecionadas = new Set<string>();
  // Duas cargas podem estar no ar ao mesmo tempo (a inicial e a da busca).
  // Só a mais recente pode desenhar: sem isto, a resposta antiga chega depois
  // e apaga a lista já filtrada.
  let cargaAtual = 0;

  const lista = el('div');
  const acoesLote = el('div', { classe: 'acoes', hidden: true });

  const busca = el('input', {
    tipo: 'search',
    id: 'admin-busca',
    placeholder: 'Buscar por nome ou e-mail',
    rotuloAria: 'Buscar conta por nome ou e-mail',
  });

  // O bloco de acoes em lote e montado uma unica vez e atualizado no lugar.
  // Refaze-lo a cada marcacao destruiria a caixa recem-clicada.
  const marcarTodas = el('input', { tipo: 'checkbox', id: 'admin-todas' });
  const rotuloTodas = el('label', { for: 'admin-todas' });
  const botaoLiberarLote = botao('', () => void decidirLote('ativo'), { classe: 'botao' });
  const botaoRecusarLote = botao('', () => void decidirLote('recusado'), { classe: 'botao-perigo' });
  const caixasPorConta = new Map<string, HTMLInputElement>();

  acoesLote.append(
    el('div', { classe: 'selecionar-todos' }, marcarTodas, rotuloTodas),
    botaoLiberarLote,
    botaoRecusarLote,
  );

  marcarTodas.addEventListener('change', () => {
    selecionadas.clear();
    if (marcarTodas.checked) for (const conta of contas) selecionadas.add(conta.id);
    for (const [id, caixa] of caixasPorConta) caixa.checked = selecionadas.has(id);
    atualizarAcoesLote();
  });

  function atualizarAcoesLote(): void {
    const cabe = statusAtual === 'aguardando' && contas.length > 0;
    acoesLote.hidden = !cabe;
    if (!cabe) return;

    const n = selecionadas.size;
    rotuloTodas.textContent = n > 0
      ? `${n} de ${contas.length} selecionadas`
      : `Selecionar todas (${contas.length})`;

    botaoLiberarLote.textContent = `Liberar ${n}`;
    botaoRecusarLote.textContent = `Recusar ${n}`;
    botaoLiberarLote.hidden = n === 0;
    botaoRecusarLote.hidden = n === 0;
    marcarTodas.checked = contas.length > 0 && n === contas.length;
    marcarTodas.indeterminate = n > 0 && n < contas.length;
  }

  const botoesAba = ABAS.map((aba) => {
    const b = botao(aba.rotulo, () => {
      statusAtual = aba.status;
      selecionadas.clear();
      atualizarAbas();
      void carregar();
    }, { classe: '' });
    b.setAttribute('role', 'tab');
    return b;
  });

  function atualizarAbas(): void {
    botoesAba.forEach((b, i) => b.setAttribute('aria-selected', String(ABAS[i].status === statusAtual)));
  }

  const area = el(
    'div',
    {},
    el('h2', { texto: 'Contas' }),
    el('div', { classe: 'abas-envoltorio' },
      el('div', { classe: 'abas', role: 'tablist' }, ...botoesAba)),
    el('div', { classe: 'campo' }, el('label', { for: 'admin-busca', texto: 'Buscar' }), busca),
    acoesLote,
    lista,
  );

  let buscaTimer: number | null = null;
  busca.addEventListener('input', () => {
    if (buscaTimer !== null) window.clearTimeout(buscaTimer);
    buscaTimer = window.setTimeout(() => void carregar(), 350);
  });

  atualizarAbas();
  void carregar();

  async function carregar(): Promise<void> {
    cargaAtual += 1;
    const minhaCarga = cargaAtual;

    substituir(lista, el('div', { classe: 'esqueleto' },
      el('div', { classe: 'esqueleto-linha' }),
      el('div', { classe: 'esqueleto-linha' }),
      el('div', { classe: 'esqueleto-linha' })));

    const { data, error } = await supabase.rpc('admin_listar_contas', {
      p_status: statusAtual,
      p_busca: busca.value.trim() || null,
    });

    if (minhaCarga !== cargaAtual) return; // resposta vencida

    if (error) {
      substituir(lista, el('div', { classe: 'caixa caixa-erro' }, el('p', { texto: mensagemDeErro(error) })));
      return;
    }

    contas = (data as ContaAdmin[]) ?? [];
    // Mantem marcadas apenas as contas que continuam na lista.
    for (const id of [...selecionadas]) {
      if (!contas.some((conta) => conta.id === id)) selecionadas.delete(id);
    }
    desenhar();
  }

  function desenhar(): void {
    caixasPorConta.clear();

    if (contas.length === 0) {
      substituir(lista, el('div', { classe: 'vazio' },
        icone('pessoas', { tamanho: 28 }),
        el('p', { texto: 'Nenhuma conta com este status.' })));
      atualizarAcoesLote();
      return;
    }

    substituir(lista, el('ul', { classe: 'lista' }, ...contas.map(linhaConta)));
    atualizarAcoesLote();
  }

  function linhaConta(conta: ContaAdmin): HTMLElement {
    const eu = conta.id === estado.usuarioId;

    const marcar = el('input', { tipo: 'checkbox', rotuloAria: `Selecionar ${conta.nome_exibicao}` });
    marcar.checked = selecionadas.has(conta.id);
    caixasPorConta.set(conta.id, marcar);
    marcar.addEventListener('change', () => {
      if (marcar.checked) selecionadas.add(conta.id);
      else selecionadas.delete(conta.id);
      atualizarAcoesLote();
    });

    // Duas ações ficam à vista; as demais vão para o menu, senão a linha
    // transborda a tela do celular.
    const principais: HTMLElement[] = [];
    const extras: Array<{ rotulo: string; aoEscolher: () => void; perigo?: boolean }> = [];

    if (conta.status !== 'ativo') {
      principais.push(botao('Liberar', () => void definirStatus(conta, 'ativo'), { classe: 'botao botao-pequeno' }));
    }
    if (conta.status === 'aguardando') {
      principais.push(botao('Recusar', () => void definirStatus(conta, 'recusado'), { classe: 'botao-perigo botao-pequeno' }));
    }
    if (conta.status === 'ativo') {
      principais.push(botao('Bloquear', () => void definirStatus(conta, 'bloqueado'), { classe: 'botao-perigo botao-pequeno' }));
    }

    extras.push(conta.papel === 'voluntario'
      ? { rotulo: 'Promover a admin', aoEscolher: () => void definirPapel(conta, 'admin') }
      : { rotulo: 'Rebaixar a voluntário', aoEscolher: () => void definirPapel(conta, 'voluntario') });

    extras.push({
      rotulo: conta.sem_limite ? 'Retirar sem limite' : 'Liberar sem limite',
      aoEscolher: () => void definirLimite(conta, !conta.sem_limite),
    });
    extras.push({ rotulo: 'Senha temporária', aoEscolher: () => abrirSenhaTemporaria(conta) });
    extras.push({
      rotulo: 'Arquivar locais da conta',
      aoEscolher: () => abrirArquivamentoEmMassa(conta),
      perigo: true,
    });

    const etiquetas = el('div', { classe: 'etiquetas' },
      el('span', {
        classe: `etiqueta${conta.status === 'ativo' ? ' ativo' : ''}${conta.status === 'bloqueado' || conta.status === 'recusado' ? ' arquivado' : ''}`,
        texto: ROTULO_STATUS_CONTA[conta.status],
      }),
      conta.papel === 'admin' ? el('span', { classe: 'etiqueta', texto: 'Administrador' }) : null,
      conta.sem_limite ? el('span', { classe: 'etiqueta', texto: 'Sem limite' }) : null,
      conta.trocar_senha ? el('span', { classe: 'etiqueta', texto: 'Troca de senha pendente' }) : null,
    );

    return el(
      'li',
      {},
      statusAtual === 'aguardando' ? marcar : null,
      el('div', { classe: 'principal' },
        el('strong', { texto: conta.nome_exibicao + (eu ? ' (você)' : '') }),
        el('span', { texto: conta.email }),
        etiquetas,
        // Sem separadores escritos: o espaçamento do flex já separa, e um "·"
        // sobrando no fim de uma linha quebrada parece erro de digitação.
        el('div', { classe: 'meta' },
          el('span', { texto: `Inscrição em ${formatarMomento(conta.criado_em)}` }),
          el('span', { texto: `${conta.locais_ativos} locais ativos` }),
          el('span', { texto: `${conta.marcados_hoje} marcados hoje` }),
          conta.decidido_em
            ? el('span', {
                texto: `Decidida em ${formatarMomento(conta.decidido_em)}`
                  + (conta.decidido_por_nome ? ` por ${conta.decidido_por_nome}` : ''),
              })
            : null,
        ),
      ),
      eu
        ? el('p', { classe: 'texto-fraco', texto: 'Você não altera a própria conta.' })
        : el('div', { classe: 'acoes' }, ...principais, menuDeAcoes(extras, `Mais ações para ${conta.nome_exibicao}`)),
    );
  }

  async function definirStatus(conta: ContaAdmin, status: StatusConta): Promise<void> {
    const { error } = await supabase.rpc('admin_definir_status', { p_perfil: conta.id, p_status: status });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso(`${conta.nome_exibicao}: ${ROTULO_STATUS_CONTA[status].toLowerCase()}.`);
    aoAtualizarContadores();
    void carregar();
  }

  async function decidirLote(status: StatusConta): Promise<void> {
    if (selecionadas.size === 0) {
      avisar('Selecione pelo menos uma conta.');
      return;
    }
    let ok = 0;
    const erros: string[] = [];
    for (const id of selecionadas) {
      const { error } = await supabase.rpc('admin_definir_status', { p_perfil: id, p_status: status });
      if (error) erros.push(mensagemDeErro(error));
      else ok += 1;
    }
    selecionadas.clear();
    if (ok > 0) avisarSucesso(`${ok} conta(s) atualizada(s).`);
    if (erros.length > 0) avisarErro(`${erros.length} falha(s): ${erros[0]}`);
    aoAtualizarContadores();
    void carregar();
  }

  async function definirPapel(conta: ContaAdmin, papel: 'admin' | 'voluntario'): Promise<void> {
    const { error } = await supabase.rpc('admin_definir_papel', { p_perfil: conta.id, p_papel: papel });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso(`${conta.nome_exibicao} agora é ${ROTULO_PAPEL[papel].toLowerCase()}.`);
    void carregar();
  }

  async function definirLimite(conta: ContaAdmin, semLimite: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_definir_limite', { p_perfil: conta.id, p_sem_limite: semLimite });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso(semLimite ? 'Limite liberado.' : 'Limite restabelecido.');
    void carregar();
  }

  function abrirSenhaTemporaria(conta: ContaAdmin): void {
    abrirModal('Senha temporária', (modal) => {
      const senha = campo({
        id: 'senha-temporaria',
        rotulo: `Senha temporária para ${conta.nome_exibicao}`,
        tipo: 'text',
        obrigatorio: true,
        dica: 'Pelo menos 10 caracteres. Combine com a pessoa por fora do app: o sistema não envia e-mails. Ela será obrigada a trocar no próximo login.',
      });

      const confirmar = el('button', { tipo: 'submit', classe: 'botao', texto: 'Definir senha temporária' });
      const form = el('form', { novalidate: true }, senha.bloco,
        el('div', { classe: 'acoes' }, confirmar,
          botao('Cancelar', () => modal.fechar(), { classe: 'botao-sutil' })));

      form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarErroCampo(senha.erro, null);

        const problemas = validarSenha(senha.entrada.value);
        if (problemas.length > 0) {
          mostrarErroCampo(senha.erro, problemas[0].mensagem);
          return;
        }

        confirmar.disabled = true;
        try {
          await chamarAdminUsuarios('definir_senha_temporaria', {
            perfil_id: conta.id,
            senha: senha.entrada.value,
          });
          modal.fechar();
          avisarSucesso('Senha temporária definida. Combine com a pessoa por fora do app.');
          void carregar();
        } catch (erro) {
          avisarErro(mensagemDeErro(erro));
          confirmar.disabled = false;
        }
      });

      return form;
    });
  }

  function abrirArquivamentoEmMassa(conta: ContaAdmin): void {
    abrirModal(`Arquivar locais de ${conta.nome_exibicao}`, (modal) => {
      const motivo = campo({
        id: 'motivo-massa',
        rotulo: 'Motivo do arquivamento',
        maxlength: 300,
        obrigatorio: true,
        dica: `Arquiva todos os ${conta.locais_ativos} locais ativos marcados ou ativados por ${conta.nome_exibicao} e cancela os agendamentos futuros deles. Nada é apagado.`,
      });

      const confirmar = el('button', {
        tipo: 'submit',
        classe: 'botao-perigo',
        texto: 'Arquivar todos os locais da conta',
      });
      const form = el('form', { novalidate: true }, motivo.bloco,
        el('div', { classe: 'acoes' }, confirmar,
          botao('Cancelar', () => modal.fechar(), { classe: 'botao-sutil' })));

      form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarErroCampo(motivo.erro, null);

        const problemas = validarMotivoArquivamento(motivo.entrada.value);
        if (problemas.length > 0) {
          mostrarErroCampo(motivo.erro, problemas[0].mensagem);
          return;
        }

        confirmar.disabled = true;
        const { data, error } = await supabase.rpc('admin_arquivar_locais_da_conta', {
          p_perfil: conta.id,
          p_motivo: motivo.entrada.value.trim(),
        });

        if (error) {
          avisarErro(mensagemDeErro(error));
          confirmar.disabled = false;
          return;
        }

        modal.fechar();
        avisarSucesso(`${data} local(is) arquivado(s).`);
        void carregar();
      });

      return form;
    });
  }

  return area;
}

// ===========================================================================
// Pedidos de limite
// ===========================================================================
function secaoPedidos(aoAtualizarContadores: () => void): HTMLElement {
  const lista = el('div');
  let cargaAtual = 0;
  const area = el('div', {},
    el('div', { classe: 'pagina-cabecalho' },
      el('h2', { texto: 'Pedidos de limite' }),
      el('p', { classe: 'sub', texto: 'Pedidos abertos de voluntários que chegaram ao limite diário.' })),
    lista,
  );

  void carregar();

  async function carregar(): Promise<void> {
    cargaAtual += 1;
    const minhaCarga = cargaAtual;

    substituir(lista, el('div', { classe: 'esqueleto' },
      el('div', { classe: 'esqueleto-linha' }), el('div', { classe: 'esqueleto-linha' })));

    const { data, error } = await supabase.rpc('admin_listar_pedidos', { p_status: 'aberto' });
    if (minhaCarga !== cargaAtual) return;
    if (error) {
      substituir(lista, el('div', { classe: 'caixa caixa-erro' }, el('p', { texto: mensagemDeErro(error) })));
      return;
    }

    const pedidos = (data as PedidoAdmin[]) ?? [];
    if (pedidos.length === 0) {
      substituir(lista, el('div', { classe: 'vazio' },
        icone('mao', { tamanho: 28 }),
        el('p', { texto: 'Nenhum pedido aberto.' })));
      return;
    }

    substituir(lista, el('ul', { classe: 'lista' },
      ...pedidos.map((pedido) =>
        el('li', {},
          el('div', { classe: 'principal' },
            el('strong', { texto: pedido.nome_exibicao }),
            el('span', { texto: pedido.email }),
            el('div', { classe: 'meta' },
              el('span', { texto: `Pedido em ${formatarMomento(pedido.criado_em)}` }),
              el('span', { texto: `${pedido.locais_total} locais no total` }),
              el('span', { texto: `${pedido.marcados_hoje} marcados hoje` })),
          ),
          el('div', { classe: 'acoes' },
            botao('Aprovar', () => void decidir(pedido, true), { classe: 'botao botao-pequeno' }),
            botao('Recusar', () => void decidir(pedido, false), { classe: 'botao-perigo botao-pequeno' }),
          ),
        ),
      ),
    ));
  }

  async function decidir(pedido: PedidoAdmin, aprovar: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_decidir_pedido', { p_id: pedido.id, p_aprovar: aprovar });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso(aprovar
      ? `${pedido.nome_exibicao} ficou sem limite diário.`
      : `Pedido de ${pedido.nome_exibicao} recusado.`);
    aoAtualizarContadores();
    void carregar();
  }

  return area;
}

// ===========================================================================
// Historico
// ===========================================================================
const TABELAS = ['perfis', 'locais', 'agendamentos', 'pedidos_limite', 'config', 'importacao'];

function secaoHistorico(): HTMLElement {
  const lista = el('div');
  let cargaAtual = 0;

  const tabela = selecao({ id: 'hist-tabela', rotulo: 'Tabela', itens: TABELAS.map((t) => ({ valor: t, texto: t })), vazio: 'Todas' });
  const acao = campo({ id: 'hist-acao', rotulo: 'Ação', dica: 'Ex.: arquivar_local, admin_definir_status' });
  const registro = campo({ id: 'hist-registro', rotulo: 'Identificador do registro' });
  const de = campo({ id: 'hist-de', rotulo: 'De', tipo: 'date' });
  const ate = campo({ id: 'hist-ate', rotulo: 'Até', tipo: 'date' });

  const area = el('div', {},
    el('div', { classe: 'pagina-cabecalho' },
      el('h2', { texto: 'Histórico' }),
      el('p', { classe: 'sub', texto: 'Tudo que foi criado ou alterado. O histórico só aceita inserções: nada aqui pode ser alterado nem apagado.' })),
    el('details', { classe: 'filtros-abertos' },
      el('summary', { texto: 'Filtros' }),
      tabela.bloco, acao.bloco, registro.bloco,
      el('div', { classe: 'linha-campos' }, de.bloco, ate.bloco),
      el('div', { classe: 'acoes' }, botao('Filtrar', () => void carregar(), { classe: 'botao' }))),
    lista,
  );

  void carregar();

  async function carregar(): Promise<void> {
    cargaAtual += 1;
    const minhaCarga = cargaAtual;

    substituir(lista, el('div', { classe: 'esqueleto' },
      el('div', { classe: 'esqueleto-linha' }), el('div', { classe: 'esqueleto-linha' }),
      el('div', { classe: 'esqueleto-linha' })));

    const { data, error } = await supabase.rpc('admin_historico', {
      p_tabela: tabela.entrada.value || null,
      p_registro_id: registro.entrada.value.trim() || null,
      p_acao: acao.entrada.value.trim() || null,
      p_de: de.entrada.value ? `${de.entrada.value}T00:00:00-03:00` : null,
      p_ate: ate.entrada.value ? `${ate.entrada.value}T23:59:59-03:00` : null,
      p_limite: 100,
    });

    if (minhaCarga !== cargaAtual) return;

    if (error) {
      substituir(lista, el('div', { classe: 'caixa caixa-erro' }, el('p', { texto: mensagemDeErro(error) })));
      return;
    }

    const linhas = (data as LinhaHistorico[]) ?? [];
    if (linhas.length === 0) {
      substituir(lista, el('div', { classe: 'vazio' },
        icone('historico', { tamanho: 28 }),
        el('p', { texto: 'Nenhuma alteração com esses filtros.' })));
      return;
    }

    substituir(lista, el('ul', { classe: 'lista' }, ...linhas.map(linhaHistorico)));
  }

  function linhaHistorico(linha: LinhaHistorico): HTMLElement {
    const mudancas = diferenca(linha.antes, linha.depois);

    return el('li', {},
      el('div', { classe: 'principal' },
        el('strong', {
          texto: ROTULO_ACAO[linha.acao]
            ?? `${linha.acao} em ${ROTULO_TABELA[linha.tabela] ?? linha.tabela}`,
        }),
        el('span', { classe: 'texto-fraco', texto: ROTULO_TABELA[linha.tabela] ?? linha.tabela }),
        el('div', { classe: 'meta' },
          el('span', { texto: formatarMomento(linha.feito_em) }),
          el('span', { texto: `por ${linha.autor_nome}` }),
          el('span', { texto: `registro ${linha.registro_id.slice(0, 8)}` })),
        el('pre', { classe: 'registro-historico', texto: mudancas }),
      ),
      linha.tabela === 'locais' && linha.depois
        ? el('div', { classe: 'acoes' },
            botao('Restaurar esta versão', () => void restaurar(linha), { classe: 'botao-secundario botao-pequeno' }))
        : null,
    );
  }

  function diferenca(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null): string {
    if (!depois) return 'registro removido';
    if (!antes) return `criado: ${resumo(depois)}`;

    const linhas: string[] = [];
    for (const chave of Object.keys(depois)) {
      const a = JSON.stringify(antes[chave] ?? null);
      const d = JSON.stringify(depois[chave] ?? null);
      if (a !== d) linhas.push(`${chave}: ${a} → ${d}`);
    }
    return linhas.length > 0 ? linhas.join('\n') : 'sem mudança de valor';
  }

  function resumo(objeto: Record<string, unknown>): string {
    const interessantes = ['nome', 'nome_exibicao', 'status', 'papel', 'tipo', 'dia', 'origem', 'novos', 'atualizados'];
    const partes = interessantes
      .filter((chave) => objeto[chave] !== undefined && objeto[chave] !== null)
      .map((chave) => `${chave}=${String(objeto[chave])}`);
    return partes.length > 0 ? partes.join(', ') : JSON.stringify(objeto).slice(0, 200);
  }

  async function restaurar(linha: LinhaHistorico): Promise<void> {
    const { error } = await supabase.rpc('restaurar_local', {
      p_id: linha.registro_id,
      p_historico_id: linha.id,
    });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    avisarSucesso('Local restaurado para a versão escolhida.');
    void carregar();
  }

  return area;
}

// ===========================================================================
// Controle
// ===========================================================================
function secaoControle(): HTMLElement {
  const estadoLeitura = el('p', { style: 'font-weight: 600' });
  const acoes = el('div', { classe: 'acoes' });

  const area = el('div', {},
    el('div', { classe: 'pagina-cabecalho' }, el('h2', { texto: 'Controle' })),

    el('div', { classe: 'secao' },
      el('div', { classe: 'secao-titulo' }, el('h3', { texto: 'Modo somente leitura' })),
      el('div', { classe: 'caixa caixa-icone' },
        icone('cadeado', { tamanho: 18 }),
        el('div', {},
          estadoLeitura,
          el('p', { classe: 'texto-fraco',
            texto: 'Com o modo ligado, nenhum voluntário escreve: ninguém marca local, edita, arquiva nem se agenda. Os administradores continuam escrevendo. Use em caso de ataque.' }),
          acoes))),

    el('div', { classe: 'secao' },
      el('div', { classe: 'secao-titulo' }, el('h3', { texto: 'Backup' })),
      el('div', { classe: 'caixa caixa-icone' },
        icone('baixar', { tamanho: 18 }),
        el('div', {},
          el('p', { classe: 'texto-fraco',
            texto: 'Exporta a base em CSV, sem senhas. Guarde os arquivos fora do Supabase. Para o backup diário completo, use scripts/exportar.ts com a chave de serviço.' }),
          el('div', { classe: 'acoes' },
            botao('Exportar base (CSV)', () => void exportar(), { classe: 'botao-secundario' }))))),
  );

  desenhar();

  function desenhar(): void {
    const ligado = estado.config?.somente_leitura ?? false;
    estadoLeitura.textContent = ligado
      ? 'O modo somente leitura está LIGADO.'
      : 'O modo somente leitura está desligado.';
    substituir(acoes, botao(ligado ? 'Desligar modo somente leitura' : 'Ligar modo somente leitura',
      () => void alternar(!ligado), { classe: ligado ? 'botao' : 'botao-perigo' }));
  }

  async function alternar(ligar: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_somente_leitura', { p_ligado: ligar });
    if (error) {
      avisarErro(mensagemDeErro(error));
      return;
    }
    await carregarSessao();
    avisarSucesso(ligar ? 'Modo somente leitura ligado.' : 'Modo somente leitura desligado.');
    desenhar();
    window.dispatchEvent(new Event('config-mudou'));
  }

  async function exportar(): Promise<void> {
    avisar('Montando a exportação...');
    try {
      const [contas, locais, pedidos, historico] = await Promise.all([
        supabase.rpc('admin_listar_contas', { p_limite: 500 }),
        supabase.from('locais').select('id, nome, tipo, uf, municipio_id, status, origem, origem_id, endereco, melhor_horario, observacoes, criado_por, ativado_por, ativado_em, arquivado_por, arquivado_em, motivo_arquivamento, criado_em').limit(10000),
        supabase.from('pedidos_limite').select('id, perfil_id, status, criado_em, decidido_por, decidido_em').limit(10000),
        supabase.rpc('admin_historico', { p_limite: 500 }),
      ]);

      const arquivos: Array<[string, unknown[]]> = [
        ['contas', (contas.data as unknown[]) ?? []],
        ['locais', (locais.data as unknown[]) ?? []],
        ['pedidos-limite', (pedidos.data as unknown[]) ?? []],
        ['historico', (historico.data as unknown[]) ?? []],
      ];

      for (const [nome, linhas] of arquivos) {
        if (linhas.length === 0) continue;
        baixarArquivo(
          `mapa-de-campanha-${nome}.csv`,
          escreverCsvCliente(linhas as Array<Record<string, unknown>>),
        );
      }
      avisarSucesso('Exportação baixada. Guarde os arquivos fora do Supabase.');
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
    }
  }

  return area;
}
