import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { BottomNav } from '@/components/layout/BottomNav';
import { AddFab } from '@/components/layout/AddFab';
import { EidosyneWordmark } from '@/components/layout/EidosyneLogo';
import { Spinner } from '@/components/ui';
import Auth from '@/screens/Auth';
import Dashboard from '@/screens/Dashboard';
import Groups from '@/screens/Groups';
import GroupDetail from '@/screens/GroupDetail';
import Balances from '@/screens/Balances';
import Friends from '@/screens/Friends';
import Activity from '@/screens/Activity';
import AddExpense from '@/screens/AddExpense';
import Profile from '@/screens/Profile';

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Branded splash while auth/session resolves
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-eidosyne-ink">
        <EidosyneWordmark tagline />
        <Spinner />
      </div>
    );
  }

  if (!user) return <Auth />;

  // Full-screen routes (no bottom nav)
  const fullScreen = location.pathname.startsWith('/add') || location.pathname.startsWith('/group/');

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/group/:id" element={<GroupDetail />} />
        <Route path="/group/:id/balances" element={<Balances />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/add" element={<AddExpense />} />
        <Route path="/add/:groupId" element={<AddExpense />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!fullScreen && <AddFab />}
      {!fullScreen && <BottomNav />}
    </>
  );
}
