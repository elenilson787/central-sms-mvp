"use client";

import { useMemo, useState } from "react";
import styles from "../../../admin.module.css";

type ServiceCountry = {
  countryId: string;
  countryCode: string;
  countryName: string;
  minProviderPrice: number;
  poolCount: number;
};

type GlobalService = {
  product: string;
  label: string;
  countries: ServiceCountry[];
  countryCount: number;
  poolCount: number;
  minProviderPrice: number;
  enabled: boolean;
  riskCategory: string | null;
  complianceBlockReason: string | null;
  saleEligible: boolean;
};

type Payload = {
  ok?: boolean;
  totalServices?: number;
  totalCountryEntries?: number;
  generatedAt?: string;
  services?: GlobalService[];
  error?: string;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function date(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export default function SmsPoolGlobalCatalogPage() {
  const [token, setToken] = useState("");
  const [services, setServices] = useState<GlobalService[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | undefined>();

  function rememberToken(value: string) {
    setToken(value);
    if (value) window.sessionStorage.setItem("central_sms_admin_token", value);
    else window.sessionStorage.removeItem("central_sms_admin_token");
  }

  async function load() {
    if (!token) {
      setError("Informe o ADMIN_API_TOKEN.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/providers/smspool/global-services", {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await response.json() as Payload;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Falha ao consultar o catálogo global.");
      }

      setServices(payload.services ?? []);
      setGeneratedAt(payload.generatedAt);
      setSelectedProduct(null);
    } catch (cause) {
      setServices([]);
      setError(cause instanceof Error ? cause.message : "Falha ao consultar o catálogo global.");
    } finally {
      setLoading(false);
    }
  }

  const filteredServices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return services;

    return services.filter((service) =>
      service.label.toLocaleLowerCase("pt-BR").includes(query)
      || service.product.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [search, services]);

  const selected = services.find((service) => service.product === selectedProduct) ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <h1 className={styles.title}>Central SMS — Catálogo global de serviços</h1>
        <p className={styles.muted}>
          Área exclusiva do administrador. Esta tela não libera serviços para venda e não compra números.
          Ela consulta o inventário global de preços do SMSPool e agrupa cada serviço pelos países onde existe oferta.
        </p>

        <section className={styles.panel}>
          <div className={styles.row}>
            <input
              className={styles.input}
              type="password"
              value={token}
              onChange={(event) => rememberToken(event.target.value)}
              placeholder="ADMIN_API_TOKEN"
              autoComplete="off"
            />
            <button className={styles.button} disabled={!token || loading} onClick={() => void load()}>
              {loading ? "Consultando SMSPool…" : "Atualizar catálogo global"}
            </button>
            <a className={styles.button} href="/admin/providers/smspool" style={{ textDecoration: "none" }}>
              Voltar ao SMSPool
            </a>
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {generatedAt && (
            <p className={styles.muted}>
              Última consulta: {date(generatedAt)} · {services.length} serviços encontrados
            </p>
          )}
        </section>

        {services.length > 0 && (
          <>
            <section className={styles.panel}>
              <div className={styles.row}>
                <input
                  className={styles.input}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Pesquisar serviço: WhatsApp, Telegram, Instagram…"
                  autoComplete="off"
                />
              </div>
              <p className={styles.muted}>
                Clique em um serviço para ver os países. O inventário usa disponibilidade/preço retornados pelo endpoint global do SMSPool.
              </p>
            </section>

            <section className={styles.card}>
              <h2>Serviços encontrados ({filteredServices.length})</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Service ID</th>
                    <th>Países</th>
                    <th>Pools</th>
                    <th>Menor preço</th>
                    <th>Venda</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.map((service) => (
                    <tr key={service.product}>
                      <td>
                        <button
                          className={styles.button}
                          type="button"
                          onClick={() => setSelectedProduct(service.product)}
                        >
                          {service.label}
                        </button>
                      </td>
                      <td>{service.product}</td>
                      <td>{service.countryCount}</td>
                      <td>{service.poolCount}</td>
                      <td>{money(service.minProviderPrice)}</td>
                      <td>
                        {service.complianceBlockReason
                          ? <span className={styles.muted}>Bloqueado: {service.complianceBlockReason}</span>
                          : service.enabled
                            ? <span className={styles.badge}>Liberado</span>
                            : <span className={styles.muted}>Não liberado</span>}
                      </td>
                    </tr>
                  ))}
                  {!filteredServices.length && (
                    <tr>
                      <td colSpan={6} className={styles.muted}>Nenhum serviço corresponde à busca.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}

        {selected && (
          <section className={styles.card}>
            <div className={styles.row}>
              <div style={{ marginRight: "auto" }}>
                <h2 style={{ margin: 0 }}>{selected.label}</h2>
                <p className={styles.muted}>
                  Service ID: {selected.product} · {selected.countryCount} país(es) · {selected.poolCount} pool(s)
                </p>
              </div>
              <button className={styles.button} type="button" onClick={() => setSelectedProduct(null)}>
                Fechar
              </button>
            </div>

            <p className={styles.muted}>
              Menor preço encontrado no conjunto de países: {money(selected.minProviderPrice)}.
              Este valor é apenas informativo e não representa necessariamente o preço final da sua Central.
            </p>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>País</th>
                  <th>Código</th>
                  <th>Country ID</th>
                  <th>Pools</th>
                  <th>Menor preço</th>
                </tr>
              </thead>
              <tbody>
                {selected.countries.map((country) => (
                  <tr key={country.countryId}>
                    <td><strong>{country.countryName}</strong></td>
                    <td>{country.countryCode || "—"}</td>
                    <td>{country.countryId}</td>
                    <td>{country.poolCount}</td>
                    <td>{money(country.minProviderPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
