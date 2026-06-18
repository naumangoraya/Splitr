import type { Expense, Member } from '@/types';
import { fromCentsPlain } from './money';

export function expensesToCsv(expenses: Expense[], members: Member[]): string {
  const name = (id: string) => members.find((m) => m.id === id)?.full_name ?? id;
  const header = ['Date', 'Description', 'Category', 'Paid by', 'Amount', 'Split type', 'Participants'];
  const rows = expenses.map((e) => [
    e.expense_date,
    e.description,
    e.category,
    name(e.paid_by),
    fromCentsPlain(e.amount_cents, e.currency),
    e.split_type,
    e.splits.map((s) => `${name(s.user_id)}:${fromCentsPlain(s.amount_owed_cents, e.currency)}`).join(' | ')
  ]);
  return [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
