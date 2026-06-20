import { NavLink } from 'react-router-dom';
import { LayoutGrid, Users, UserRound, Activity as ActivityIcon, CircleUser } from 'lucide-react';

const tabs = [
  { to: '/', label: 'Home', Icon: LayoutGrid, end: true },
  { to: '/groups', label: 'Groups', Icon: Users, end: false },
  { to: '/friends', label: 'Friends', Icon: UserRound, end: false },
  { to: '/activity', label: 'Activity', Icon: ActivityIcon, end: false },
  { to: '/profile', label: 'Profile', Icon: CircleUser, end: false }
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-line bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="flex items-stretch justify-around">
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `tap flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                isActive ? 'text-brand' : 'text-ink-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 1.9} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
