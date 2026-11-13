import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { Shell } from "./components/layout/Shell";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import KnowledgeBase from "./pages/KnowledgeBase";
import WorkflowMonitor from "./pages/WorkflowMonitor";
import Evaluation from "./pages/Evaluation";
import Settings from "./pages/Settings";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<Shell />}>
          <Route path="overview" element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="documents" element={<KnowledgeBase />} />
          <Route path="monitor" element={<WorkflowMonitor />} />
          <Route path="evaluation" element={<Evaluation />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
