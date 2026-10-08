import { useState, type ReactNode } from 'react';
import {
  BookOpen, CalendarDays, Hand, History, KeyRound, Lock, LogOut, Map as IconeMapa,
  MapPin, Menu, SlidersHorizontal, Users,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import type { Rota } from '@/lib/rota';
import { estado, souAdmin } from '@/lib/sessao';
import { cn } from '@/lib/utils';

export interface Contadores {
  contas_aguardando: number;
  pedidos_abertos: number;
}

/** Iniciais do nome de exibição, para o avatar do menu. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

interface Props {
  rota: Rota;
  contadores: Contadores;
  aoSair: () => void;
}

export function Cabecalho({ rota, contadores, aoSair }: Props) {
  const [aberto, setAberto] = useState(false);
  const admin = souAdmin();
  const total = contadores.contas_aguardando + contadores.pedidos_abertos;

  const atual = (nome: Rota['nome'], secao?: string) =>
    rota.nome === nome && (secao === undefined || (rota as { secao?: string }).secao === secao);

  const fechar = () => setAberto(false);

  return (
    <header
      id="cabecalho"
      className="bg-background/85 supports-[backdrop-filter]:bg-background/70 relative z-30 flex h-14 shrink-0 items-center gap-2 border-b px-2 backdrop-blur-md sm:px-3"
    >
      {/* Menu não modal: o botão continua acessível (com aria-expanded) e o
          fundo escurecido abaixo fecha ao toque. Radix só desenha o próprio
          overlay no modo modal. */}
      {aberto ? (
        <div aria-hidden="true" onClick={fechar}
          className="animate-in fade-in-0 fixed inset-0 z-50 bg-black/50 duration-200" />
      ) : null}
      <Sheet open={aberto} onOpenChange={setAberto} modal={false}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11 rounded-lg" aria-label="Abrir menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          id="menu"
          side="left"
          aria-label="Navegação principal"
          className="w-[300px] gap-0 p-0 sm:max-w-[300px]"
          onOpenAutoFocus={(evento) => {
            // O foco vai para o primeiro link, não para o botão de fechar.
            evento.preventDefault();
            (evento.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('nav a')?.focus();
          }}
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="flex items-center gap-2.5 text-base">
              <Marca />
              Mapa de Campanha
            </SheetTitle>
            <SheetDescription className="sr-only">Navegação principal do app</SheetDescription>
          </SheetHeader>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Navegação principal">
            <ItemMenu href="#/mapa" icone={<IconeMapa />} atual={atual('mapa')} aoClicar={fechar}>Mapa</ItemMenu>
            <ItemMenu href="#/meus-agendamentos" icone={<CalendarDays />} atual={atual('meus-agendamentos')} aoClicar={fechar}>
              Meus agendamentos
            </ItemMenu>
            <ItemMenu href="#/regras" icone={<BookOpen />} atual={atual('regras')} aoClicar={fechar}>Regras de conduta</ItemMenu>

            {admin ? (
              <>
                <Separator className="my-2" />
                <p className="text-muted-foreground px-3 pt-1 pb-1.5 text-xs font-medium">Administração</p>
                <ItemMenu href="#/admin/contas" icone={<Users />} atual={atual('admin', 'contas')} aoClicar={fechar}
                  contador={contadores.contas_aguardando}>Contas</ItemMenu>
                <ItemMenu href="#/admin/pedidos" icone={<Hand />} atual={atual('admin', 'pedidos')} aoClicar={fechar}
                  contador={contadores.pedidos_abertos}>Pedidos de limite</ItemMenu>
                <ItemMenu href="#/admin/historico" icone={<History />} atual={atual('admin', 'historico')} aoClicar={fechar}>
                  Histórico
                </ItemMenu>
                <ItemMenu href="#/admin/controle" icone={<SlidersHorizontal />} atual={atual('admin', 'controle')} aoClicar={fechar}>
                  Controle
                </ItemMenu>
              </>
            ) : null}

            <Separator className="my-2" />
            <ItemMenu href="#/trocar-senha" icone={<KeyRound />} atual={atual('trocar-senha')} aoClicar={fechar}>
              Trocar minha senha
            </ItemMenu>
          </nav>

          <SheetFooter className="gap-3 border-t p-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-9">
                <AvatarFallback className="bg-ponto-suave text-ponto-forte text-xs font-semibold">
                  {iniciais(estado.perfil?.nome_exibicao ?? '')}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 leading-tight">
                <strong className="truncate text-sm font-semibold">{estado.perfil?.nome_exibicao ?? ''}</strong>
                <span className="text-muted-foreground truncate text-xs">{estado.email ?? ''}</span>
              </div>
            </div>
            <Button variant="outline" className="h-10 w-full" onClick={() => { fechar(); aoSair(); }}>
              <LogOut />
              Sair
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <h1 className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight">
        <Marca />
        <span className="truncate">Mapa de Campanha</span>
      </h1>

      <Badge
        id="contador-admin"
        variant="destructive"
        hidden={!admin || total === 0}
        className="ml-auto h-6 min-w-6 rounded-full px-2 tabular-nums"
        aria-label={`${contadores.contas_aguardando} conta(s) e ${contadores.pedidos_abertos} pedido(s) aguardando`}
      >
        {total}
      </Badge>
    </header>
  );
}

function Marca() {
  return (
    <span className="bg-ponto shadow-ponto/30 flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
      <MapPin className="size-4" strokeWidth={2.25} />
    </span>
  );
}

interface PropsItem {
  href: string;
  icone: ReactNode;
  atual: boolean;
  contador?: number;
  aoClicar: () => void;
  children: ReactNode;
}

function ItemMenu({ href, icone, atual, contador, aoClicar, children }: PropsItem) {
  return (
    <a
      href={href}
      onClick={aoClicar}
      aria-current={atual ? 'page' : undefined}
      className={cn(
        'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none transition-colors',
        'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
        'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-[current=page]:bg-accent aria-[current=page]:text-foreground',
        '[&_svg]:text-muted-foreground [&_svg]:size-4 aria-[current=page]:[&_svg]:text-foreground',
      )}
    >
      {icone}
      <span className="flex-1">{children}</span>
      {contador && contador > 0 ? (
        <Badge variant="destructive" className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">{contador}</Badge>
      ) : null}
    </a>
  );
}

/** Faixa de aviso quando o administrador liga o modo somente leitura. */
export function FaixaSomenteLeitura({ ligado }: { ligado: boolean }) {
  return (
    <div
      id="faixa-somente-leitura"
      role="status"
      hidden={!ligado}
      className="bg-aviso-suave text-foreground border-aviso/30 relative z-20 shrink-0 border-b px-4 py-2 text-[13px] font-medium"
    >
      {ligado ? (
        <span className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-center">
          <Lock className="text-aviso size-4 shrink-0" />
          Somente leitura: nenhuma marcação ou agendamento pode ser feito agora.
        </span>
      ) : null}
    </div>
  );
}
