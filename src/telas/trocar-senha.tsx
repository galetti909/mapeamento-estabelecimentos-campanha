import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CampoTexto } from '@/components/campo';
import { CabecalhoPagina, Pagina } from '@/components/pagina';
import { TelaAcesso } from '@/components/tela-acesso';
import { avisarErro, avisarSucesso } from '@/lib/avisos';
import { mensagemDeErro } from '@/lib/erros';
import { chamarAdminUsuarios } from '@/lib/supabase';
import { validarSenha } from '@/lib/validacao';

/**
 * Troca de senha. Obrigatória logo depois do login quando trocar_senha está
 * ligado (senha temporária definida por um administrador).
 */
export function TelaTrocarSenha({ obrigatoria, aoConcluir }: { obrigatoria: boolean; aoConcluir: () => void }) {
  const formulario = <FormularioSenha aoConcluir={aoConcluir} />;

  if (obrigatoria) {
    return (
      <TelaAcesso
        icone={<KeyRound />}
        titulo="Escolha uma nova senha"
        descricao="Um administrador definiu uma senha temporária para a sua conta. Escolha uma nova senha para continuar."
      >
        {formulario}
      </TelaAcesso>
    );
  }

  return (
    <Pagina className="max-w-lg">
      <CabecalhoPagina titulo="Trocar senha" descricao="A nova senha vale a partir da próxima entrada." />
      <Card className="py-6">
        <CardContent className="px-6">{formulario}</CardContent>
      </Card>
    </Pagina>
  );
}

function FormularioSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erros, setErros] = useState<{ senha?: string; confirmacao?: string }>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErros({});

    const problemas = validarSenha(senha, confirmacao);
    if (problemas.length > 0) {
      const novos: typeof erros = {};
      for (const problema of problemas) {
        novos[problema.campo === 'senha' ? 'senha' : 'confirmacao'] ??= problema.mensagem;
      }
      setErros(novos);
      evento.currentTarget.querySelector<HTMLInputElement>('#nova-senha')?.focus();
      return;
    }

    setEnviando(true);
    try {
      // A Edge Function troca a senha e desliga a marca trocar_senha.
      await chamarAdminUsuarios('trocar_minha_senha', { senha });
      avisarSucesso('Senha trocada.');
      aoConcluir();
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
      setEnviando(false);
    }
  }

  return (
    <form noValidate onSubmit={enviar} className="grid gap-4">
      <CampoTexto id="nova-senha" rotulo="Nova senha" type="password" autoComplete="new-password" required
        dica="Pelo menos 10 caracteres." value={senha} onChange={(e) => setSenha(e.target.value)} erro={erros.senha}
      />
      <CampoTexto id="nova-senha-confirmacao" rotulo="Repita a nova senha" type="password" autoComplete="new-password"
        required value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} erro={erros.confirmacao}
      />
      <Button type="submit" className="mt-1 h-11 w-full" disabled={enviando}>
        {enviando ? <><Loader2 className="animate-spin" />Trocando...</> : 'Trocar senha'}
      </Button>
    </form>
  );
}
