import { toast } from 'sonner';

// Avisos flutuantes de curta duracao (Sonner, o toast do shadcn/ui). A
// classe "aviso-flutuante" fica em todos: e por ela que os testes os acham.

const CLASSE = 'aviso-flutuante';

export function avisar(mensagem: string, ms = 5000): void {
  toast(mensagem, { duration: ms, className: CLASSE });
}

export function avisarErro(mensagem: string): void {
  toast.error(mensagem, { duration: 7000, className: `${CLASSE} erro` });
}

export function avisarSucesso(mensagem: string): void {
  toast.success(mensagem, { duration: 5000, className: `${CLASSE} sucesso` });
}
