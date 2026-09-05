import { NavLink, Route, Routes } from 'react-router-dom';
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
      <nav className="app-nav">
        <div className="app-nav__inner">
          <span className="app-nav__brand">Task Assignment</span>
          {/* NavLink applies its own `active` class on the matching route,
              which the stylesheet turns into the underlined current tab. */}
          <NavLink to="/" end className="app-nav__link">
            Tasks
          </NavLink>
          <NavLink to="/tasks/new" className="app-nav__link">
            New Task
          </NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<TaskListPage />} />
        <Route path="/tasks/new" element={<TaskCreationPage />} />
      </Routes>
    </>
  );
}
