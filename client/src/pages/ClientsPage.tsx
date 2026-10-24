import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Client } from "../types";
import { t } from "../i18n";
import "./ClientPage.css";

export function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    api
      .listClients()
      .then(setClients)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  function openModal() {
    setError(null);
    setName("");
    setEmail("");
    setShowModal(true);
  }

  function closeModal() {
    if (submitting) return;
    setShowModal(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createClient({ name, contact_email: email || null, contact_phone: null, notes: null });
      setShowModal(false);
      setName("");
      setEmail("");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!window.confirm(t("clientsPage.confirmDelete"))) return;
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteClient(id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="clients-header">
        <h1>{t("clientsPage.title")}</h1>
        <button type="button" className="add-client-btn" onClick={openModal}>
          {t("clientsPage.addClient")}
        </button>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : clients.length === 0 ? (
        <p>{t("clientsPage.empty")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("clientsPage.colName")}</th>
              <th>{t("clientsPage.colEmail")}</th>
              <th>{t("clientsPage.colWebsites")}</th>
              <th>{t("clientsPage.colAdded")}</th>
              <th aria-label={t("common.actions")}></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr
                key={c.id}
                className="client-row"
                onClick={() => navigate(`/clients/${c.id}`)}
              >
                <td>{c.name}</td>
                <td>{c.contact_email ?? t("common.none")}</td>
                <td>{c.website_count ?? 0}</td>
                <td>{c.created_at}</td>
                <td className="client-row-actions">
                  <button
                    type="button"
                    className="icon-btn delete-btn"
                    aria-label={`${t("clientsPage.deleteClient")}: ${c.name}`}
                    title={t("clientsPage.deleteClient")}
                    disabled={deletingId === c.id}
                    onClick={(e) => handleDelete(e, c.id)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>{t("clientsPage.modalTitle")}</h2>
            <form onSubmit={handleAdd} className="modal-form">
              <label className="modal-field">
                <span>{t("clientsPage.fieldName")}</span>
                <input
                  autoFocus
                  placeholder={t("clientsPage.fieldName")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="modal-field">
                <span>{t("clientsPage.fieldEmail")}</span>
                <input
                  placeholder={t("clientsPage.fieldEmail")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                />
              </label>

              {error && <p style={{ color: "crimson" }}>{error}</p>}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closeModal} disabled={submitting}>
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={submitting || !name.trim()}>
                  {submitting ? t("clientsPage.adding") : t("clientsPage.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
