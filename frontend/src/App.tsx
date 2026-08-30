import { Routes, Route } from "react-router";
import DashboardPage from "@/pages/DashboardPage";
import GraphPage from "@/pages/GraphPage";
import AuditPage from "@/pages/AuditPage";
import ReportPage from "@/pages/ReportPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/graph" element={<GraphPage />} />
    </Routes>
  );
}

// <Route path="/graph" element={<GraphPage />} />
// <Route path="/audit" element={<AuditPage />} />
// <Route path="/report" element={<ReportPage />} />
