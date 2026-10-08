import type { ComponentProps, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Moldura {
  id: string;
  rotulo: string;
  dica?: string;
  erro?: string | null;
  className?: string;
}

/** Rótulo, campo, dica e erro, ligados por id para os leitores de tela. */
export function Campo({ id, rotulo, dica, erro, className, children }: Moldura & { children: ReactNode }) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {dica ? (
        <p id={`${id}-dica`} className="text-muted-foreground text-[13px] leading-snug">
          {dica}
        </p>
      ) : null}
      {erro ? (
        <p role="alert" className="text-destructive text-[13px] font-medium leading-snug">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

function descricao(id: string, dica?: string): string | undefined {
  return dica ? `${id}-dica` : undefined;
}

type PropsTexto = Moldura & Omit<ComponentProps<typeof Input>, 'id'>;

export function CampoTexto({ id, rotulo, dica, erro, className, ...resto }: PropsTexto) {
  return (
    <Campo id={id} rotulo={rotulo} dica={dica} erro={erro} className={className}>
      <Input
        id={id}
        name={id}
        aria-describedby={descricao(id, dica)}
        aria-invalid={erro ? true : undefined}
        {...resto}
      />
    </Campo>
  );
}

type PropsTextoLongo = Moldura & Omit<ComponentProps<typeof Textarea>, 'id'>;

export function CampoTextoLongo({ id, rotulo, dica, erro, className, ...resto }: PropsTextoLongo) {
  return (
    <Campo id={id} rotulo={rotulo} dica={dica} erro={erro} className={className}>
      <Textarea
        id={id}
        name={id}
        rows={3}
        aria-describedby={descricao(id, dica)}
        aria-invalid={erro ? true : undefined}
        {...resto}
      />
    </Campo>
  );
}
