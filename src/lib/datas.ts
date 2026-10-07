// Datas e horas sempre no fuso America/Sao_Paulo.

export const FUSO = 'America/Sao_Paulo';

/** Dia corrente em Brasilia, no formato AAAA-MM-DD. */
export function hojeBrasilia(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
  // en-CA ja devolve AAAA-MM-DD.
  return partes;
}

/** Soma dias a uma data AAAA-MM-DD, sem depender do fuso local. */
export function somarDias(diaISO: string, dias: number): string {
  const data = new Date(`${diaISO}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "sex, 09/10" */
export function formatarDiaCurto(diaISO: string): string {
  const data = new Date(`${diaISO}T12:00:00Z`);
  const semana = DIAS_SEMANA[data.getUTCDay()].slice(0, 3);
  const dia = String(data.getUTCDate()).padStart(2, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${semana}, ${dia}/${mes}`;
}

/** "09/10/2026" */
export function formatarDia(diaISO: string): string {
  const [ano, mes, dia] = diaISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** "08:00" a partir de "08:00:00" */
export function formatarHora(hora: string): string {
  return hora.slice(0, 5);
}

/** "09/10/2026 às 14:32" para um timestamptz do banco. */
export function formatarMomento(iso: string): string {
  const data = new Date(iso);
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(data);
  const parte = (tipo: string) => f.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('day')}/${parte('month')}/${parte('year')} às ${parte('hour')}:${parte('minute')}`;
}
