import { useCallback } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { usePush } from '@/hooks/usePush';
import { BottomNav } from '@/components/layout/BottomNav';
import { AddFab } from '@/components/layout/AddFab';
import { EidosyneWordmark } from '@/components/layout/EidosyneLogo';
import { Spinner } from '@/components/ui';
import Auth from '@/screens/Auth';
import Dashboard from '@/screens/Dashboard';
import Groups from '@/screens/Groups';
import GroupDetail from '@/screens/GroupDetail';
import Balances from '@/screens/Balances';
import Chat from '@/screens/Chat';
import Chats from '@/screens/Chats';
import Friends from '@/screens/Friends';
import Activity from '@/screens/Activity';
import Notifications from '@/screens/Notifications';
import AddExpense from '@/screens/AddExpense';
import Profile from '@/screens/Profile';

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // register for background push when logged in; tapping a push opens the group
  const openGroup = useCallback((groupId: string) => navigate(`/group/${groupId}`), [navigate]);
  usePush(user?.id, openGroup);

  if (loading) {
    // Branded splash while auth/session resolves
    return (
      <div className="flex h-app flex-col items-center justify-center gap-6 bg-eidosyne-ink">
        <EidosyneWordmark tagline />
        <Spinner />
      </div>
    );
  }

  if (!user) return <Auth />;

  // Full-screen routes (no bottom nav / FAB)
  const fullScreen = location.pathname.startsWith('/add')
    || location.pathname.startsWith('/group/')
    || location.pathname === '/chats'
    || location.pathname === '/notifications';

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/group/:id" element={<GroupDetail />} />
        <Route path="/group/:id/balances" element={<Balances />} />
        <Route path="/group/:id/chat" element={<Chat />} />
        <Route path="/chats" element={<Chats />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/notifications" element={<Notifications />} />
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
