import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

/**
 * Floating "add expense" button shown on all main tab screens.
 * Sits above the bottom nav, pinned to the right edge of the 480px shell.
 */
export function AddFab() {
  const nav = useNavigate();
  return (
    <div className="pointer-events-none fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2">
      <button
        onClick={() => nav('/add')}
        aria-label="Add expense"
        className="tap pointer-events-auto absolute bottom-[76px] right-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-sheet active:scale-95"
        style={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }}
      >
        <Plus className="h-7 w-7" />
      </button>
    </div>
  );
}
