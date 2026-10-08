import { Clock, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TelaAcesso } from '@/components/tela-acesso';
import type { StatusConta } from '@/lib/tipos';

const TEXTOS: Record<string, { titulo: string; corpo: string }> = {
  aguardando: {
    titulo: 'Sua conta está aguardando liberação',
    corpo: 'Um administrador vai analisar o pedido. Enquanto isso, nenhuma outra tela fica disponível. O app não envia e-mails: se quiser, fale com alguém do grupo por fora dele.',
  },
  recusado: {
    titulo: 'Sua conta não está liberada',
    corpo: 'Um administrador analisou o pedido e não liberou a conta. Se achar que houve um engano, fale com alguém do grupo por fora do app.',
  },
  bloqueado: {
    titulo: 'Sua conta não está liberada',
    corpo: 'Um administrador bloqueou esta conta. Se achar que houve um engano, fale com alguém do grupo por fora do app.',
  },
};

/** Tela única de quem não tem conta liberada. */
export function TelaAguardando({ status, email, aoSair }: { status: StatusConta; email: string | null; aoSair: () => void }) {
  const texto = TEXTOS[status] ?? TEXTOS.aguardando;
  const esperando = status === 'aguardando';

  return (
    <TelaAcesso
      icone={esperando ? <Clock /> : <Lock />}
      tom={esperando ? 'neutro' : 'perigo'}
      titulo={texto.titulo}
      descricao={texto.corpo}
    >
      {email ? (
        <div className="bg-muted/50 flex items-center gap-3 rounded-lg border px-4 py-3">
          <Mail className="text-muted-foreground size-4 shrink-0" />
          <div className="grid min-w-0 leading-tight">
            <span className="text-muted-foreground text-xs">Conta</span>
            <span className="truncate text-sm font-medium">{email}</span>
          </div>
        </div>
      ) : null}
      <Button variant="outline" className="h-11 w-full" onClick={aoSair}>Sair</Button>
    </TelaAcesso>
  );
}
