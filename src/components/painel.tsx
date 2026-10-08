import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** Nome acessível do diálogo ("Ficha do local", "Marcar novo local"). */
  rotulo: string;
  titulo: ReactNode;
  /** Linha acima do título (tipo do local, situação). */
  sobretitulo?: ReactNode;
  rotuloFechar: string;
  aoFechar: () => void;
  children: ReactNode;
}

/**
 * Painel do mapa: folha que sobe de baixo no celular e coluna à direita no
 * computador. Não é modal: no computador o mapa continua usável ao lado.
 * No celular um fundo escurecido separa a folha do mapa e fecha ao toque.
 */
export function Painel({ rotulo, titulo, sobretitulo, rotuloFechar, aoFechar, children }: Props) {
  const idTitulo = useId();

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={aoFechar}
        className="animate-in fade-in-0 absolute inset-0 z-[1100] bg-black/40 duration-200 md:hidden"
      />
      <section
        role="dialog"
        aria-modal="false"
        aria-label={rotulo}
        className={[
          'bg-background absolute z-[1200] flex flex-col shadow-2xl',
          // celular: folha de baixo
          'inset-x-0 bottom-0 max-h-[88%] rounded-t-2xl border-t',
          'animate-in slide-in-from-bottom duration-300 ease-out',
          // computador: coluna lateral
          'md:inset-y-3 md:right-3 md:left-auto md:max-h-none md:w-[400px] md:rounded-2xl md:border',
          'md:slide-in-from-bottom-0 md:slide-in-from-right-4 md:fade-in-0',
        ].join(' ')}
      >
        <div aria-hidden="true" className="bg-border mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full md:hidden" />
        <header className="flex items-start gap-3 border-b px-5 pt-3 pb-4 md:pt-5">
          <div className="grid min-w-0 flex-1 gap-1.5">
            {sobretitulo}
            <h2 id={idTitulo} className="text-lg leading-snug font-semibold tracking-tight break-words">{titulo}</h2>
          </div>
          <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-9 shrink-0 rounded-full" aria-label={rotuloFechar} onClick={aoFechar}>
            <X />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      </section>
    </>
  );
}
