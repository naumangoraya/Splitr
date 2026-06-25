import { useState, type ReactNode } from 'react';
import { Users, UserPlus, Receipt, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui';

// A short, skippable first-run guide. Shown once per device (see App.tsx).
const SLIDES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Users className="h-8 w-8" />,
    title: 'Groups for shared costs',
    body: 'Create a group for a trip, flat or event. Everyone’s expenses and balances stay in one place — in PKR.'
  },
  {
    icon: <UserPlus className="h-8 w-8" />,
    title: 'Friends for 1-on-1',
    body: 'Add a friend by email to track what you owe each other directly, without needing a group.'
  },
  {
    icon: <Receipt className="h-8 w-8" />,
    title: 'Add & split expenses',
    body: 'Tap the + button to log an expense and split it equally, by exact amounts, percentages or shares.'
  },
  {
    icon: <MessageCircle className="h-8 w-8" />,
    title: 'Chat & settle up',
    body: 'Message a friend or a whole group, mention a transaction, and settle up when you’re squared away.'
  }
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex h-app flex-col bg-canvas px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      {/* Skip — always available */}
      <div className="flex justify-end">
        <button onClick={onDone} className="tap rounded-lg px-3 py-2 text-[14px] font-semibold text-ink-muted">Skip</button>
      </div>

      {/* Slide */}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-wash text-brand">
          {slide.icon}
        </div>
        <h1 className="font-display text-[24px] font-bold text-ink">{slide.title}</h1>
        <p className="mt-3 max-w-[18rem] text-[15px] leading-relaxed text-ink-muted">{slide.body}</p>
      </div>

      {/* Dots + action */}
      <div className="flex flex-col items-center gap-5">
        <div className="flex items-center gap-2">
          {SLIDES.map((_, n) => (
            <span key={n} className={`h-2 rounded-full transition-all ${n === i ? 'w-6 bg-brand' : 'w-2 bg-line'}`} />
          ))}
        </div>
        <Button full onClick={() => (last ? onDone() : setI((n) => n + 1))}>
          {last ? 'Get started' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
