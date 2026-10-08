import type { ReactNode } from 'react';
import { Ban, Database, HeartHandshake, Map as IconeMapa, MapPin, ShieldCheck, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CabecalhoPagina, Pagina } from '@/components/pagina';

const REGRAS: Array<{ icone: ReactNode; texto: string }> = [
  { icone: <Ban />, texto: 'Não cole cartazes nem adesivos em estabelecimentos. Pela lei eleitoral, eles contam como bens de uso comum.' },
  { icone: <UserX />, texto: 'Não registre dados de pessoas nos textos do app: nada de nome, telefone, CPF, e-mail, endereço residencial ou opinião política de quem você abordar.' },
  { icone: <MapPin />, texto: 'Marque só locais reais e públicos.' },
  { icone: <HeartHandshake />, texto: 'Converse com quem quiser conversar e respeite quem não quiser.' },
];

function Secao({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base" role="heading" aria-level={3}>
          <span className="text-muted-foreground [&_svg]:size-4">{icone}</span>
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

function Prosa({ itens }: { itens: string[] }) {
  return (
    <ul className="text-muted-foreground grid list-disc gap-2 pl-5 text-sm leading-relaxed marker:text-border">
      {itens.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export function TelaRegras() {
  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Regras de conduta"
        descricao="Este grupo é formado por eleitores engajados, não pela campanha oficial."
      />

      <ol className="grid gap-3 sm:grid-cols-2">
        {REGRAS.map((regra, i) => (
          <li key={regra.texto} className="bg-card flex gap-3.5 rounded-xl border p-4 shadow-xs">
            <span className="bg-ponto-suave text-ponto-forte flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]">
              {regra.icone}
            </span>
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs font-medium tabular-nums">Regra {i + 1}</span>
              <span className="text-sm leading-relaxed">{regra.texto}</span>
            </div>
          </li>
        ))}
      </ol>

      <Secao icone={<ShieldCheck />} titulo="O que o app guarda">
        <Prosa itens={[
          'Seu e-mail, sua senha (guardada com hash pelo Supabase) e seu nome de exibição.',
          'Os locais que você marca e os seus agendamentos.',
          'Nenhum dado das pessoas abordadas.',
          'Seu nome de exibição aparece para outros voluntários liberados na agenda dos locais. Seu e-mail só é visto por administradores.',
          'O app não envia e-mail nenhum e não usa analytics, pixels nem scripts de terceiros.',
          'A localização do botão "Onde estou" é usada só no seu aparelho e não é enviada a ninguém.',
          'Até 30 dias depois de 25/10/2026 a base é apagada do Supabase.',
        ]} />
      </Secao>

      <Secao icone={<Database />} titulo="Fontes dos dados">
        <Prosa itens={[
          'Locais importados: OpenStreetMap, sob licença ODbL.',
          'Municípios e divisas: malha municipal do IBGE, dados públicos.',
          'Listas de feiras e equipamentos públicos: portais de dados abertos de prefeituras.',
        ]} />
      </Secao>

      <Secao icone={<IconeMapa />} titulo="Créditos do mapa">
        <div className="grid gap-1 text-sm">
          <p className="font-medium">© colaboradores do OpenStreetMap</p>
          <p className="text-muted-foreground leading-relaxed">
            As imagens de fundo do mapa (tiles) vêm da camada padrão do OpenStreetMap e são usadas com o crédito exigido
            pela política de uso.
          </p>
        </div>
      </Secao>
    </Pagina>
  );
}
