import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useStore } from './context/Store';
import Overview from './pages/Overview'; import Explore from './pages/Explore'; import Subjects from './pages/Subjects'; import SubjectDetail from './pages/SubjectProfile'; import TopicProfile from './pages/TopicProfile'; import SubjectNew from './pages/SubjectNew'; import Saved from './pages/Saved';
import Planner from './pages/Planner'; import Seniors from './pages/Seniors'; import Share from './pages/Share'; import Messages from './pages/Messages';
import Notifications from './pages/Notifications'; import AskGroup from './pages/AskGroup'; import SeniorProfile from './pages/SeniorProfile'; import Profile, { ProfileEdit } from './pages/Profile'; import Admin from './pages/Admin'; import NotFound from './pages/NotFound';
import { Forgot, Login, Register, ResetPassword } from './pages/Auth';
import { Spinner } from './components/ui';

/** With a server configured, every app page needs a signed-in session. Demo mode is always signed in. */
function RequireAuth() {
  const s = useStore();
  if (s.authStatus === 'checking') return <Spinner label="Checking your session" />;
  if (s.authStatus === 'signedOut') return <Navigate to="/login" replace />;
  return <Shell />;
}

export default function App() {
  const { toast, canUndo, runUndo } = useStore();
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} /><Route path="/forgot" element={<Forgot />} /><Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<RequireAuth />}>
          <Route index element={<Overview />} /><Route path="explore" element={<Explore />} /><Route path="subjects" element={<Subjects />} /><Route path="subjects/new" element={<SubjectNew />} /><Route path="subjects/:id" element={<SubjectDetail />} /><Route path="topics/:topicId" element={<TopicProfile />} /><Route path="saved" element={<Saved />} />
          <Route path="planner" element={<Planner />} /><Route path="seniors" element={<Seniors />} /><Route path="seniors/:id" element={<SeniorProfile />} /><Route path="share" element={<Share />} />
          <Route path="messages" element={<Messages />} /><Route path="messages/:id" element={<Messages />} /><Route path="ask-groups/:id" element={<AskGroup />} /><Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} /><Route path="profile/edit" element={<ProfileEdit />} /><Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <div className="toast" role="status" aria-live="polite">{toast}<span className="toast-actions">{canUndo && <button type="button" onClick={() => void runUndo()}>Undo</button>}</span></div>
    </>
  );
}
