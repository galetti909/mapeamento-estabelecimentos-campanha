import { useRef, useState, type FormEvent } from 'react';
import { KeyRound, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampoTexto } from '@/components/campo';
import { TelaAcesso } from '@/components/tela-acesso';
import { avisarErro } from '@/lib/avisos';
import { mensagemDeErro } from '@/lib/erros';
import { supabase } from '@/lib/supabase';
import { validarEmail, validarNomeExibicao, validarSenha } from '@/lib/validacao';

const AVISO_PRIVACIDADE = [
  'O app guarda o seu e-mail, a sua senha (com hash, pelo Supabase) e o seu nome de exibição.',
  'O seu nome de exibição aparece para outros voluntários liberados na agenda dos locais. O seu e-mail só é visto por administradores.',
  'Nenhum dado das pessoas abordadas é registrado, e o app não envia e-mail nenhum.',
  'A base é apagada até 30 dias depois de 25/10/2026.',
];

/** Tela de entrada com as abas "Entrar" e "Inscrever-se". */
export function TelaEntrar({ aoEntrar, aoInscrever }: { aoEntrar: () => void; aoInscrever: () => void }) {
  const [aba, setAba] = useState('entrar');

  return (
    <TelaAcesso
      icone={<MapPin />}
      titulo="Mapa de Campanha"
      descricao="Voluntários marcam locais com circulação de pessoas e se agendam para ir conversar. O acesso é liberado à mão por um administrador."
    >
      <Tabs value={aba} onValueChange={setAba} className="gap-5">
        <TabsList className="grid h-10 w-full grid-cols-2">
          <TabsTrigger value="entrar">Entrar</TabsTrigger>
          <TabsTrigger value="inscrever">Inscrever-se</TabsTrigger>
        </TabsList>
        <TabsContent value="entrar" className="grid gap-5">
          <FormularioEntrar aoEntrar={aoEntrar} />
        </TabsContent>
        <TabsContent value="inscrever">
          <FormularioInscrever aoConcluir={aoInscrever} />
        </TabsContent>
      </Tabs>
    </TelaAcesso>
  );
}

function FormularioEntrar({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<{ email?: string; senha?: string }>({});
  const [enviando, setEnviando] = useState(false);
  const refEmail = useRef<HTMLInputElement>(null);
  const refSenha = useRef<HTMLInputElement>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErros({});

    const problemasEmail = validarEmail(email);
    if (problemasEmail.length > 0) {
      setErros({ email: problemasEmail[0].mensagem });
      refEmail.current?.focus();
      return;
    }
    if (senha === '') {
      setErros({ senha: 'Informe a sua senha.' });
      refSenha.current?.focus();
      return;
    }

    setEnviando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) throw error;
      aoEntrar();
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
      setEnviando(false);
    }
  }

  return (
    <>
      <form noValidate onSubmit={enviar} className="grid gap-4">
        <CampoTexto ref={refEmail} id="entrar-email" rotulo="E-mail" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} erro={erros.email}
        />
        <CampoTexto ref={refSenha} id="entrar-senha" rotulo="Senha" type="password" autoComplete="current-password" required
          value={senha} onChange={(e) => setSenha(e.target.value)} erro={erros.senha}
        />
        <Button type="submit" className="mt-1 h-11 w-full" disabled={enviando}>
          {enviando ? <><Loader2 className="animate-spin" />Entrando...</> : 'Entrar'}
        </Button>
      </form>

      <Alert className="bg-muted/50">
        <KeyRound />
        <AlertTitle>Esqueci a senha</AlertTitle>
        <AlertDescription className="leading-relaxed">
          O app não envia e-mails, então não há recuperação automática. Peça a um administrador do grupo, por fora do
          app, que defina uma senha temporária. Na primeira entrada com ela, você escolhe uma nova.
        </AlertDescription>
      </Alert>
    </>
  );
}

type CampoInscricao = 'email' | 'nome_exibicao' | 'senha' | 'confirmacao' | 'aviso';

function FormularioInscrever({ aoConcluir }: { aoConcluir: () => void }) {
  const [valores, setValores] = useState({ email: '', nome: '', senha: '', confirmacao: '' });
  const [li, setLi] = useState(false);
  const [erros, setErros] = useState<Partial<Record<CampoInscricao, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);

  const mudar = (campo: keyof typeof valores) => (e: { target: { value: string } }) =>
    setValores((atual) => ({ ...atual, [campo]: e.target.value }));

  function focar(campo: CampoInscricao) {
    const ids: Record<CampoInscricao, string> = {
      email: 'inscrever-email',
      nome_exibicao: 'inscrever-nome',
      senha: 'inscrever-senha',
      confirmacao: 'inscrever-confirmacao',
      aviso: 'inscrever-aviso',
    };
    formulario.current?.querySelector<HTMLElement>(`#${ids[campo]}`)?.focus();
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErros({});

    const problemas = [
      ...validarEmail(valores.email),
      ...validarNomeExibicao(valores.nome),
      ...validarSenha(valores.senha, valores.confirmacao),
    ];

    if (problemas.length > 0) {
      const novos: Partial<Record<CampoInscricao, string>> = {};
      for (const problema of problemas) {
        const campo = problema.campo as CampoInscricao;
        novos[campo] ??= problema.mensagem;
      }
      setErros(novos);
      focar(problemas[0].campo as CampoInscricao);
      return;
    }

    if (!li) {
      setErros({ aviso: 'Marque que você leu o aviso de privacidade.' });
      focar('aviso');
      return;
    }

    setEnviando(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: valores.email.trim(),
        password: valores.senha,
        options: { data: { nome_exibicao: valores.nome.trim() } },
      });
      if (error) throw error;

      // Nenhum e-mail e enviado: a conta nasce aguardando liberacao. A
      // inscricao pelo Supabase Auth ja abre uma sessao, que e encerrada
      // aqui: quem decide o que acontece a seguir e quem chamou a tela.
      await supabase.auth.signOut();
      aoConcluir();
    } catch (erro) {
      avisarErro(mensagemDeErro(erro));
      setEnviando(false);
    }
  }

  return (
    <form ref={formulario} noValidate onSubmit={enviar} className="grid gap-4">
      <CampoTexto id="inscrever-email" rotulo="E-mail" type="email" autoComplete="email" required
        value={valores.email} onChange={mudar('email')} erro={erros.email}
      />
      <CampoTexto id="inscrever-nome" rotulo="Nome de exibição" maxLength={40} required
        dica="De 2 a 40 caracteres. É o único dado seu que outros voluntários veem, na agenda dos locais."
        value={valores.nome} onChange={mudar('nome')} erro={erros.nome_exibicao}
      />
      <CampoTexto id="inscrever-senha" rotulo="Senha" type="password" autoComplete="new-password" required
        dica="Pelo menos 10 caracteres." value={valores.senha} onChange={mudar('senha')} erro={erros.senha}
      />
      <CampoTexto id="inscrever-confirmacao" rotulo="Repita a senha" type="password" autoComplete="new-password" required
        value={valores.confirmacao} onChange={mudar('confirmacao')} erro={erros.confirmacao}
      />

      <div className="bg-muted/50 grid gap-3 rounded-lg border p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="text-visitado-forte size-4" />
          Aviso de privacidade
        </p>
        <ul className="text-muted-foreground grid list-disc gap-1.5 pl-5 text-[13px] leading-relaxed">
          {AVISO_PRIVACIDADE.map((texto) => <li key={texto}>{texto}</li>)}
        </ul>
        <div className="flex items-start gap-2.5 pt-1">
          <Checkbox id="inscrever-aviso" checked={li} onCheckedChange={(v) => setLi(v === true)}
            aria-invalid={erros.aviso ? true : undefined} className="mt-0.5"
          />
          <Label htmlFor="inscrever-aviso" className="leading-snug">Li e entendi o aviso de privacidade.</Label>
        </div>
        {erros.aviso ? <p role="alert" className="text-destructive text-[13px] font-medium">{erros.aviso}</p> : null}
      </div>

      <Button type="submit" className="h-11 w-full" disabled={enviando}>
        {enviando ? <><Loader2 className="animate-spin" />Enviando...</> : 'Inscrever-se'}
      </Button>
    </form>
  );
}
