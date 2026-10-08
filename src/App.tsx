import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import AgentDetail from "./pages/AgentDetail.tsx";
import Agents from "./pages/Agents.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import ProjectDetail from "./pages/ProjectDetail.tsx";
import ServerDetail from "./pages/ServerDetail.tsx";
import ServerTools from "./pages/ServerTools.tsx";
import SessionDetail from "./pages/SessionDetail.tsx";
import Settings from "./pages/Settings.tsx";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/servers/:id" element={<ServerDetail />} />
          <Route path="/servers/:serverId/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/servers/:id/tools" element={<ServerTools />} />
          <Route path="/servers/:id/agents/:agentId" element={<AgentDetail />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </Router>
  );
}
