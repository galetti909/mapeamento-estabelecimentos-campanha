import { el } from '../lib/dom.js';
import { icone, type NomeIcone } from '../lib/icones.js';

const REGRAS = [
  'Não cole cartazes nem adesivos em estabelecimentos. Pela lei eleitoral, eles contam como bens de uso comum.',
  'Não registre dados de pessoas nos textos do app: nada de nome, telefone, CPF, e-mail, endereço residencial ou opinião política de quem você abordar.',
  'Marque só locais reais e públicos.',
  'Converse com quem quiser conversar e respeite quem não quiser.',
];

const ICONE_DA_REGRA: NomeIcone[] = ['xis', 'cadeado', 'local', 'pessoas'];

function secao(titulo: string, ...filhos: Array<Node | null>): HTMLElement {
  return el('div', { classe: 'secao' },
    el('div', { classe: 'secao-titulo' }, el('h3', { texto: titulo })),
    ...filhos);
}

export function telaRegras(): HTMLElement {
  return el(
    'div',
    { classe: 'pagina' },
    el('div', { classe: 'pagina-cabecalho' },
      el('h2', { texto: 'Regras de conduta' }),
      el('p', {
        classe: 'sub',
        texto: 'Este grupo é formado por eleitores engajados, não pela campanha oficial.',
      })),

    el('ul', { classe: 'lista' },
      ...REGRAS.map((regra, i) =>
        el('li', {},
          icone(ICONE_DA_REGRA[i] ?? 'check', { tamanho: 20 }),
          el('div', { classe: 'principal' }, el('span', { texto: regra }))))),

    secao('O que o app guarda',
      el('ul', { classe: 'prosa' },
        el('li', { texto: 'Seu e-mail, sua senha (guardada com hash pelo Supabase) e seu nome de exibição.' }),
        el('li', { texto: 'Os locais que você marca e os seus agendamentos.' }),
        el('li', { texto: 'Nenhum dado das pessoas abordadas.' }),
        el('li', { texto: 'Seu nome de exibição aparece para outros voluntários liberados na agenda dos locais. Seu e-mail só é visto por administradores.' }),
        el('li', { texto: 'O app não envia e-mail nenhum e não usa analytics, pixels nem scripts de terceiros.' }),
        el('li', { texto: 'A localização do botão "Onde estou" é usada só no seu aparelho e não é enviada a ninguém.' }),
        el('li', { texto: 'Até 30 dias depois de 25/10/2026 a base é apagada do Supabase.' }),
      )),

    secao('Fontes dos dados',
      el('ul', { classe: 'prosa' },
        el('li', { texto: 'Locais importados: OpenStreetMap, sob licença ODbL.' }),
        el('li', { texto: 'Municípios e divisas: malha municipal do IBGE, dados públicos.' }),
        el('li', { texto: 'Listas de feiras e equipamentos públicos: portais de dados abertos de prefeituras.' }),
      )),

    secao('Créditos do mapa',
      el('div', { classe: 'caixa caixa-icone' },
        icone('mapa', { tamanho: 18 }),
        el('div', {},
          el('p', { texto: '© colaboradores do OpenStreetMap' }),
          el('p', {
            classe: 'creditos',
            texto: 'As imagens de fundo do mapa (tiles) vêm da camada padrão do OpenStreetMap e são usadas com o crédito exigido pela política de uso.',
          })))),
  );
}
