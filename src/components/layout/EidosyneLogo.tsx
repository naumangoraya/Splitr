/**
 * Eidosyne wordmark, recreated as styled text (no image asset needed; crisp at
 * any size). White "Ei" + green "dosyne", matching the company logo.
 * Brand identity only — kept separate from the app's indigo UI accent.
 */
export function EidosyneWordmark({ className = '', tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <span className="font-display text-[28px] font-extrabold tracking-tight leading-none">
        <span className="text-white">Ei</span><span className="text-eidosyne">dosyne</span>
      </span>
      {tagline && (
        <span className="mt-1.5 text-[9.5px] font-medium uppercase tracking-[0.18em] text-white/55">
          From idea to intelligence we power progress
        </span>
      )}
    </div>
  );
}

/** Small one-line "Powered by Eidosyne" footer for light backgrounds. */
export function PoweredByEidosyne({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-[12px] text-ink-muted ${className}`}>
      Powered by <span className="font-display font-bold"><span className="text-ink">Ei</span><span className="text-eidosyne">dosyne</span></span>
    </p>
  );
}
