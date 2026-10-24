import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import { Layout } from "./components/Layout";
import { OverviewPage } from "./pages/OverviewPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientProfilePage } from "./pages/ClientProfilePage";
import { WebsiteDetailPage } from "./pages/WebsiteDetailPage";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientProfilePage />} />
          <Route path="/clients/:clientId/websites/:websiteId" element={<WebsiteDetailPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
