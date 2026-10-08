import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Coluna central das telas de conteúdo (agendamentos, regras, admin). */
export function Pagina({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 sm:py-8', className)}>{children}</div>;
}

export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{titulo}</h2>
        {descricao ? <p className="text-muted-foreground text-sm leading-relaxed">{descricao}</p> : null}
      </div>
      {acoes}
    </div>
  );
}

/** Estado vazio: ícone num círculo, frase e uma dica opcional. */
export function Vazio({ icone, titulo, dica }: { icone: ReactNode; titulo: string; dica?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="bg-muted text-muted-foreground mb-1 flex size-11 items-center justify-center rounded-full [&_svg]:size-5">
        {icone}
      </span>
      <p className="text-sm font-medium">{titulo}</p>
      {dica ? <p className="text-muted-foreground text-[13px]">{dica}</p> : null}
    </div>
  );
}

/** Lista em cartão, com divisórias. Os testes acham as linhas por ".lista > li". */
export function Lista({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn('lista bg-card divide-y overflow-hidden rounded-xl border shadow-xs', className)}>{children}</ul>
  );
}

export function LinhaLista({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <li className={cn('flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5 sm:flex-nowrap sm:items-center', className)}>
      {children}
    </li>
  );
}
