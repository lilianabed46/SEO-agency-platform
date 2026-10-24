import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { ClientProfile, SiteType } from "../types";
import { t } from "../i18n";
import { Ltr } from "../components/Ltr";
import { COUNTRIES, LANGUAGES, COUNTRY_LABELS, LANGUAGE_LABELS, joinedLabels } from "../lib/geoLabels";
import "./ClientPage.css";

const SITE_TYPES: SiteType[] = ["store", "services", "blog"];

export function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [url, setUrl] = useState("");
  const [siteType, setSiteType] = useState<SiteType>("store");
  const [countries, setCountries] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [goal, setGoal] = useState("");
  const [niche, setNiche] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [cms, setCms] = useState("");

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const countryMenuRef = useRef<HTMLDivElement>(null);

  function refresh() {
    if (!id) return;
    api
      .getClient(id)
      .then(setClient)
      .catch((err) => setError(err.message));
  }

  useEffect(refresh, [id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
      if (countryMenuRef.current && !countryMenuRef.current.contains(e.target as Node)) {
        setCountryMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function resetForm() {
    setUrl("");
    setSiteType("store");
    setCountries([]);
    setLanguages([]);
    setGoal("");
    setNiche("");
    setTargetAudience("");
    setCms("");
  }

  function openModal() {
    setError(null);
    resetForm();
    setShowModal(true);
  }

  function closeModal() {
    if (submitting) return;
    setShowModal(false);
    setLangMenuOpen(false);
    setCountryMenuOpen(false);
  }

  function toggleLanguage(lang: string) {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  }

  function toggleCountry(country: string) {
    setCountries((prev) => (prev.includes(country) ? prev.filter((c) => c !== country) : [...prev, country]));
  }

  async function handleAddWebsite(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !url.trim() || countries.length === 0 || languages.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.addWebsite(id, {
        url,
        site_type: siteType,
        country: countries.join(", "),
        language: languages.join(", "),
        goal: goal || null,
        niche: niche || null,
        target_audience: targetAudience || null,
        cms: cms || null,
      });
      setShowModal(false);
      resetForm();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!client) return <p>{t("common.loading")}</p>;

  return (
    <div>
      <Link to="/clients" className="back-link">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="back-link-icon"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
        <span>{t("clientProfilePage.backToClients")}</span>
      </Link>

      <h1>{client.name}</h1>
      <p>{client.contact_email ?? t("clientProfilePage.noEmail")}</p>

      <div className="section-header">
        <h2>{t("clientProfilePage.websitesTitle")}</h2>
        <button type="button" className="add-client-btn" onClick={openModal}>
          {t("clientProfilePage.addWebsite")}
        </button>
      </div>

      {client.websites.length === 0 ? (
        <p>{t("clientProfilePage.noWebsites")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("clientProfilePage.colUrl")}</th>
              <th>{t("clientProfilePage.colType")}</th>
              <th>{t("clientProfilePage.colCountry")}</th>
              <th>{t("clientProfilePage.colLanguage")}</th>
              <th>{t("clientProfilePage.colGoal")}</th>
              <th>{t("clientProfilePage.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {client.websites.map((w) => (
              <tr key={w.id}>
                <td>
                  <a href={w.url} target="_blank" rel="noreferrer">
                    <Ltr>{w.url}</Ltr>
                  </a>
                </td>
                <td>{t(`clientProfilePage.siteTypes.${w.site_type}` as any) ?? w.site_type}</td>
                <td>{joinedLabels(w.country, COUNTRY_LABELS)}</td>
                <td>{joinedLabels(w.language, LANGUAGE_LABELS)}</td>
                <td>{w.goal ?? t("common.none")}</td>
                <td>
                  <Link to={`/clients/${client.id}/websites/${w.id}`} className="view-link">
                    <svg
                      className="view-link-arrow"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                    <span>{t("clientProfilePage.view")}</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
            <h2>{t("clientProfilePage.modalTitle")}</h2>
            <form onSubmit={handleAddWebsite} className="modal-form">
              <label className="modal-field modal-field-full">
                <span>{t("clientProfilePage.fieldUrl")}</span>
                <input
                  autoFocus
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  dir="ltr"
                />
              </label>

              <div className="modal-form-grid">
                <label className="modal-field">
                  <span>{t("clientProfilePage.fieldType")}</span>
                  <select value={siteType} onChange={(e) => setSiteType(e.target.value as SiteType)}>
                    {SITE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`clientProfilePage.siteTypes.${type}` as any)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="modal-field">
                  <span>{t("clientProfilePage.fieldCountry")}</span>
                  <div className="multiselect" ref={countryMenuRef}>
                    <button
                      type="button"
                      className="multiselect-trigger"
                      onClick={() => setCountryMenuOpen((o) => !o)}
                    >
                      <span className="multiselect-trigger-label">
                        {countries.length === 0
                          ? t("clientProfilePage.selectCountry")
                          : countries.map((c) => COUNTRY_LABELS.get(c) ?? c).join("، ")}
                      </span>
                      <svg
                        className={`multiselect-chevron${countryMenuOpen ? " open" : ""}`}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {countryMenuOpen && (
                      <div className="multiselect-panel">
                        {COUNTRIES.map(([value, label]) => (
                          <label key={value} className="multiselect-option">
                            <input
                              type="checkbox"
                              checked={countries.includes(value)}
                              onChange={() => toggleCountry(value)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </label>

                <label className="modal-field">
                  <span>{t("clientProfilePage.fieldLanguage")}</span>
                  <div className="multiselect" ref={langMenuRef}>
                    <button
                      type="button"
                      className="multiselect-trigger"
                      onClick={() => setLangMenuOpen((o) => !o)}
                    >
                      <span className="multiselect-trigger-label">
                        {languages.length === 0
                          ? t("clientProfilePage.selectLanguages")
                          : languages.map((lang) => LANGUAGE_LABELS.get(lang) ?? lang).join("، ")}
                      </span>
                      <svg
                        className={`multiselect-chevron${langMenuOpen ? " open" : ""}`}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {langMenuOpen && (
                      <div className="multiselect-panel">
                        {LANGUAGES.map(([value, label]) => (
                          <label key={value} className="multiselect-option">
                            <input
                              type="checkbox"
                              checked={languages.includes(value)}
                              onChange={() => toggleLanguage(value)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </label>

                <label className="modal-field">
                  <span>{t("clientProfilePage.fieldGoal")}</span>
                  <input value={goal} onChange={(e) => setGoal(e.target.value)} />
                </label>
                <label className="modal-field">
                  <span>{t("clientProfilePage.fieldNiche")}</span>
                  <input value={niche} onChange={(e) => setNiche(e.target.value)} />
                </label>
                <label className="modal-field">
                  <span>{t("clientProfilePage.fieldAudience")}</span>
                  <input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />
                </label>
                <label className="modal-field">
                  <span>{t("clientProfilePage.fieldCms")}</span>
                  <input value={cms} onChange={(e) => setCms(e.target.value)} />
                </label>
              </div>

              {error && <p style={{ color: "crimson" }}>{error}</p>}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closeModal} disabled={submitting}>
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !url.trim() || countries.length === 0 || languages.length === 0}
                >
                  {submitting ? t("clientProfilePage.adding") : t("clientProfilePage.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
