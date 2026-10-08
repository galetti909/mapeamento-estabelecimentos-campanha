import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  icone: ReactNode;
  titulo: string;
  descricao?: string;
  /** Destaque do ícone: neutro, perigo (conta bloqueada) ou marca (entrada). */
  tom?: 'marca' | 'neutro' | 'perigo';
  children?: ReactNode;
}

/**
 * Moldura das telas fora do app (entrada, inscrição, espera, troca de senha
 * obrigatória): um cartão centrado sobre um fundo de pontos que lembra o mapa.
 */
export function TelaAcesso({ icone, titulo, descricao, tom = 'marca', children }: Props) {
  return (
    <div className="relative flex min-h-dvh items-start justify-center overflow-hidden px-4 py-10 sm:items-center sm:py-16">
      <FundoDePontos />
      <Card className="relative w-full max-w-md gap-5 shadow-lg shadow-black/5">
        <CardHeader className="gap-3">
          <span
            className={cn(
              'flex size-11 items-center justify-center rounded-xl [&_svg]:size-5',
              tom === 'marca' && 'bg-ponto text-white shadow-md shadow-ponto/30',
              tom === 'neutro' && 'bg-secondary text-secondary-foreground',
              tom === 'perigo' && 'bg-destructive/10 text-destructive',
            )}
          >
            {icone}
          </span>
          <div className="grid gap-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight" role="heading" aria-level={2}>
              {titulo}
            </CardTitle>
            {descricao ? <CardDescription className="leading-relaxed">{descricao}</CardDescription> : null}
          </div>
        </CardHeader>
        {children ? <CardContent className="grid gap-5">{children}</CardContent> : null}
      </Card>
    </div>
  );
}

/** Pontos vermelhos e verdes espalhados, bem apagados, atrás do cartão. */
function FundoDePontos() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="absolute -top-24 -left-24 size-72 rounded-full bg-ponto/15 blur-3xl" />
      <div className="absolute -right-24 -bottom-24 size-72 rounded-full bg-visitado/15 blur-3xl" />
    </div>
  );
}
