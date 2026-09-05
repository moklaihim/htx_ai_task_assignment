import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { TaskListPage } from './pages/TaskListPage';
import { TaskCreationPage } from './pages/TaskCreationPage';
import { Toaster } from './components/Toaster';

// React Router mounts both pages client-side under one document (REQ-0.7,
// design §6.1) — clicking between them is a DOM update, not a browser
// navigation, which is what makes this an SPA rather than two HTML pages.
export default function App() {
  return (
    <>
      <Toaster />
      <nav style={{ display: 'flex', gap: '1rem', padding: '1rem', borderBottom: '1px solid #ddd' }}>
        <NavLink to="/" end>
          Tasks
        </NavLink>
        <Link to="/tasks/new">New Task</Link>
      </nav>
      <Routes>
        <Route path="/" element={<TaskListPage />} />
        <Route path="/tasks/new" element={<TaskCreationPage />} />
      </Routes>
    </>
  );
}
