import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import Dashboard from "./pages/Dashboard.tsx";
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
          <Route path="/servers/:id" element={<ServerDetail />} />
          <Route path="/servers/:id/tools" element={<ServerTools />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </Router>
  );
}
