"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

type RentalType = {
  id: string;
  name: string;
  region: string | null;
  periods: number[];
};

type RentalPlan = {
  days: number;
  salePriceCents: number | null;
  currency: "BRL";
  pricingConfigured: boolean;
};

type RentalService = {
  id: string;
  name: string;
};

type RentalServiceMode = "GENERAL" | "SERVICE_SPECIFIC";

type RentalListPayload = {
  ok: true;
  mode: "live-readonly";
  kind: "TEMPORARY_HOSTING";
  purchaseExecutionEnabled: false;
  rentals: RentalType[];
};

type RentalDetailsPayload = {
  ok: true;
  mode: "live-readonly";
  kind: "TEMPORARY_HOSTING";
  purchaseExecutionEnabled: false;
  rental: RentalType;
  plans: RentalPlan[];
  services: RentalService[];
  serviceMode: RentalServiceMode;
};

type RentalQuotePayload = {
  ok: true;
  mode: "live-readonly";
  kind: "TEMPORARY_HOSTING";
  purchaseExecutionEnabled: false;
  blockedReason: "PURCHASE_NOT_AVAILABLE";
  canAfford: boolean | null;
  walletBalanceCents: number;
  rental: RentalType;
  service: RentalService | null;
  serviceMode: RentalServiceMode;
  days: number;
  availability: { stock: number };
  price: { configured: boolean; salePriceCents: number | null; currency: "BRL" };
};

const QUICK_SEARCHES = ["Telegram", "Discord", "Instagram"];

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function popup(title: string, message: string) {
  const webApp = window.Telegram?.WebApp;
  webApp?.HapticFeedback?.impactOccurred("light");
  webApp?.showPopup({ title, message, buttons: [{ type: "ok" }] });
}

function smoothScroll(target: HTMLElement | null) {
  if (!target) return;
  window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

export default function SmsPoolRentalPanel() {
  const [rentals, setRentals] = useState<RentalType[]>([]);
  const [rentalId, setRentalId] = useState("");
  const [details, setDetails] = useState<RentalDetailsPayload | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState<RentalService | null>(null);
  const [quote, setQuote] = useState<RentalQuotePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const periodRef = useRef<HTMLDivElement | null>(null);
  const serviceRef = useRef<HTMLDivElement | null>(null);
  const actionRef = useRef<HTMLButtonElement | null>(null);
  const quoteRef = useRef<HTMLElement | null>(null);

  async function requestCatalog(selectedRentalId?: string) {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) throw new Error("TELEGRAM_SESSION_REQUIRED");
    const response = await fetch("/api/telegram/miniapp/rentals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData: webApp.initData, rentalId: selectedRentalId }),
    });
    const payload = await response.json() as RentalListPayload | RentalDetailsPayload | { error?: string };
    if (!response.ok || !("ok" in payload)) {
      throw new Error((payload as { error?: string }).error ?? "RENTAL_CATALOG_FAILED");
    }
    return payload;
  }

  useEffect(() => {
    void (async () => {
      setLoading(true); setError(null);
      try {
        const payload = await requestCatalog() as RentalListPayload;
        setRentals(payload.rentals);
        const first = payload.rentals[0];
        if (first) setRentalId(first.id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar os aluguéis disponíveis.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!rentalId) return;
    void (async () => {
      setDetailsLoading(true); setError(null); setDetails(null); setDays(null); setSelectedService(null); setSearch(""); setQuote(null);
      try {
        const payload = await requestCatalog(rentalId) as RentalDetailsPayload;
        setDetails(payload);
        setDays(payload.plans[0]?.days ?? null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar esta opção de aluguel.");
      } finally {
        setDetailsLoading(false);
      }
    })();
  }, [rentalId]);

  useEffect(() => {
    if (details) smoothScroll(periodRef.current);
  }, [details]);

  useEffect(() => {
    if (selectedService) smoothScroll(actionRef.current);
  }, [selectedService]);

  useEffect(() => {
    if (quote) smoothScroll(quoteRef.current);
  }, [quote]);

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filteredServices = useMemo(() => {
    if (!details || details.serviceMode !== "SERVICE_SPECIFIC" || query.length < 2) return [];
    return details.services
      .filter((service) => service.name.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 30);
  }, [details, query]);

  function chooseService(service: RentalService | null) {
    setSelectedService(service);
    setSearch(service?.name ?? "");
    setQuote(null);
  }

  async function checkAvailability() {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData || !rentalId || !days || !details) return;
    if (details.serviceMode === "SERVICE_SPECIFIC" && !selectedService) return;

    setQuoteLoading(true); setQuote(null);
    try {
      const response = await fetch("/api/telegram/miniapp/rentals/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData: webApp.initData,
          rentalId,
          days,
          serviceId: details.serviceMode === "SERVICE_SPECIFIC" ? selectedService?.id : undefined,
        }),
      });
      const payload = await response.json() as RentalQuotePayload | { error?: string };
      if (!response.ok || !("ok" in payload)) {
        throw new Error((payload as { error?: string }).error ?? "RENTAL_QUOTE_FAILED");
      }
      setQuote(payload as RentalQuotePayload);
    } catch (cause) {
      popup("Não foi possível consultar", cause instanceof Error ? cause.message : "Falha ao consultar aluguel.");
    } finally {
      setQuoteLoading(false);
    }
  }

  const selectedPlan = details?.plans.find((plan) => plan.days === days) ?? null;
  const canCheck = Boolean(days && details && (details.serviceMode === "GENERAL" || selectedService));

  return <section className={styles.catalogSection}>
    <div className={styles.catalogGuide}>
      <div className={styles.guideIcon}>🗓️</div>
      <div>
        <strong>Manter o mesmo número por vários dias</strong>
        <p>Escolha o país/tipo e o período. Algumas opções funcionam como aluguel geral; outras exigem escolher o app/site que poderá enviar códigos. Esta consulta é real, mas a compra continua bloqueada.</p>
      </div>
    </div>

    {loading && <div className={styles.loading}>Carregando opções de aluguel longo…</div>}
    {error && <div className={styles.error}>{error}</div>}

    {!loading && !error && rentals.length === 0 && <div className={styles.empty}>Nenhuma opção de aluguel longo foi retornada neste momento.</div>}

    {!loading && rentals.length > 0 && <div className={styles.filters}>
      <label className={styles.fieldLabel} htmlFor="rental-type">País / tipo do número</label>
      <select id="rental-type" className={styles.select} value={rentalId} onChange={(event) => setRentalId(event.target.value)}>
        {rentals.map((rental) => <option key={rental.id} value={rental.id}>{rental.name}{rental.region ? ` · ${rental.region}` : ""}</option>)}
      </select>

      {detailsLoading && <div className={styles.loading}>Carregando períodos e serviços…</div>}

      {details && details.plans.length === 0 && <div ref={periodRef} className={styles.warnNotice}>
        Nenhum período de aluguel foi retornado para esta opção. Escolha outro país/tipo de número enquanto consultamos a disponibilidade atual do catálogo.
      </div>}

      {details && details.plans.length > 0 && <>
        <div ref={periodRef}>
          <label className={styles.fieldLabel} htmlFor="rental-days">Por quanto tempo?</label>
          <select id="rental-days" className={styles.select} value={days ?? ""} onChange={(event) => {
            setDays(Number(event.target.value)); setQuote(null); smoothScroll(serviceRef.current);
          }}>
            {details.plans.map((plan) => <option key={plan.days} value={plan.days}>
              {plan.days} dias · {plan.salePriceCents !== null ? formatMoney(plan.salePriceCents) : "preço em configuração"}
            </option>)}
          </select>
          {selectedPlan && <span className={styles.helperText}>Preço final do aluguel para o período selecionado: {selectedPlan.salePriceCents !== null ? formatMoney(selectedPlan.salePriceCents) : "em configuração"}.</span>}
        </div>

        {details.serviceMode === "GENERAL" && <div ref={serviceRef} className={styles.okNotice}>
          <strong>Aluguel geral</strong><br />
          Esta opção não precisa escolher um app ou site. O mesmo número fica disponível durante o período contratado e pode receber SMS dos serviços permitidos pelas regras do fornecedor.
        </div>}

        {details.serviceMode === "SERVICE_SPECIFIC" && <div ref={serviceRef}>
          <label className={styles.fieldLabel} htmlFor="rental-service-search">Para qual app ou site?</label>
          <input
            id="rental-service-search"
            className={styles.input}
            value={search}
            onChange={(event) => { setSearch(event.target.value); setSelectedService(null); setQuote(null); }}
            placeholder="Ex.: Telegram, Discord, Instagram"
            autoComplete="off"
          />
          <div className={styles.quickSearches} aria-label="Buscas rápidas de aluguel">
            <span>Exemplos:</span>
            {QUICK_SEARCHES.map((item) => <button key={item} className={styles.quickSearchButton} type="button" onClick={() => {
              setSearch(item); setSelectedService(null); setQuote(null); smoothScroll(serviceRef.current);
            }}>{item}</button>)}
          </div>

          <label className={styles.fieldLabel} htmlFor="rental-service-select">Ou escolha na lista de serviços disponíveis</label>
          <select
            id="rental-service-select"
            className={styles.select}
            value={selectedService?.id ?? ""}
            onChange={(event) => {
              const service = details.services.find((item) => item.id === event.target.value) ?? null;
              chooseService(service);
            }}
          >
            <option value="">Selecione entre {details.services.length} serviços disponíveis nesta opção</option>
            {details.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
          <span className={styles.helperText}>A lista mostra os apps e sites aceitos por este tipo de aluguel. O número específico só é atribuído quando a compra for liberada.</span>

          {details.services.length === 0 && <div className={styles.warnNotice}>
            Esta opção exige um serviço específico, mas nenhum serviço permitido está disponível no catálogo da Central SMS neste momento.
          </div>}

          {details.services.length > 0 && query.length < 2 && <div className={styles.searchPrompt}>
            <strong>Pesquise acima ou escolha diretamente na lista</strong>
            <span>Assim você consegue ver quais serviços estão realmente disponíveis para esta opção de número.</span>
          </div>}

          {details.services.length > 0 && query.length >= 2 && <div className={styles.offerList}>
            {!filteredServices.length && <div className={styles.empty}>Esse serviço não apareceu para esta opção de aluguel. Escolha um dos serviços disponíveis na lista ou tente outra opção de número.</div>}
            {filteredServices.map((service) => <button
              key={service.id}
              type="button"
              className={styles.secondaryButton}
              onClick={() => chooseService(service)}
            >
              {selectedService?.id === service.id ? "✓ " : ""}{service.name}
            </button>)}
          </div>}
        </div>}

        {canCheck && <button ref={actionRef} className={styles.primaryButton} type="button" disabled={quoteLoading} onClick={() => void checkAvailability()}>
          {quoteLoading
            ? "Consultando…"
            : details.serviceMode === "GENERAL"
              ? "Consultar disponibilidade do aluguel"
              : `Consultar disponibilidade para ${selectedService?.name ?? "o serviço"}`}
        </button>}
      </>}
    </div>}

    {quote && <article ref={quoteRef} className={styles.offerCard}>
      <div className={styles.offerTop}>
        <div>
          <span className={styles.demoBadge}>ALUGUEL LONGO · SOMENTE CONSULTA</span>
          <h3>{quote.serviceMode === "GENERAL" ? "Número de aluguel geral" : quote.service?.name ?? "Número de longo prazo"}</h3>
          <p>{quote.rental.name} · {quote.days} dias</p>
        </div>
        <div className={styles.offerPrice}>{quote.price.salePriceCents !== null ? formatMoney(quote.price.salePriceCents) : "Preço em configuração"}</div>
      </div>

      <div className={styles.quoteRows}>
        <div><span>Números disponíveis agora</span><strong>{quote.availability.stock}</strong></div>
        <div><span>Período</span><strong>{quote.days} dias</strong></div>
        <div><span>Seu saldo</span><strong>{formatMoney(quote.walletBalanceCents)}</strong></div>
      </div>

      <div className={quote.availability.stock > 0 ? styles.okNotice : styles.warnNotice}>
        {quote.availability.stock > 0 ? "Há números disponíveis para este período agora." : "Não há números disponíveis para este período neste momento."}
      </div>

      {quote.serviceMode === "GENERAL" && <div className={styles.okNotice}>
        Este é um aluguel geral: o número não fica limitado a um único app/site, mas o uso continua sujeito aos serviços permitidos e às regras do fornecedor.
      </div>}

      <div className={styles.warnNotice}>
        O número fica sob seu acesso apenas durante o período contratado. Renovação depende da disponibilidade e das regras do fornecedor; não trate o número como permanente depois do vencimento.
      </div>

      <button className={styles.primaryButton} type="button" disabled>Compra de aluguel ainda bloqueada</button>
    </article>}
  </section>;
}
