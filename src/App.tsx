import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { BottomNav } from '@/components/layout/BottomNav';
import { AddFab } from '@/components/layout/AddFab';
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
    return (
      <AppShell>
        <Spinner label="Loading Splitr…" />
      </AppShell>
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
