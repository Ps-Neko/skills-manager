import { Routes, Route } from 'react-router-dom';
import Shell from './components/Shell';
import Dashboard from './pages/Dashboard';
import Duplicates from './pages/Duplicates';
import Recommend from './pages/Recommend';
import Workflows from './pages/Workflows';
import Cleanup from './pages/Cleanup';
import Settings from './pages/Settings';
export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="duplicates" element={<Duplicates />} />
        <Route path="recommend" element={<Recommend />} />
        <Route path="recommend/:cap" element={<Recommend />} />
        <Route path="workflows" element={<Workflows />} />
        <Route path="cleanup" element={<Cleanup />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
