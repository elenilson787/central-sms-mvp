export default function HomePage() {
  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "56px 24px" }}>
      <h1>CENTRAL SMS — MVP</h1>
      <p>Backend modular para catálogo de números temporários, Telegram, carteira, ativações e PIX.</p>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", marginTop: 32 }}>
        {[
          ["📱 Ativação curta", "Números para uma ativação/SMS, obtidos sob demanda do provider."],
          ["🗓 Número temporário", "Categoria hosting: número mantido por um período disponibilizado pelo provider."],
          ["💳 Carteira", "Débito, reembolso e depósito registrados atomicamente no banco."],
          ["🤖 Telegram", "Interface principal via webhook, sem lógica crítica no cliente."],
        ].map(([title, text]) => <section key={title} style={{ background: "white", padding: 20, borderRadius: 12, border: "1px solid #e5e7eb" }}><h2 style={{ marginTop: 0 }}>{title}</h2><p>{text}</p></section>)}
      </div>
      <p style={{ marginTop: 32 }}><b>Compras reais:</b> desligadas por padrão até validação comercial do fornecedor, moeda da API e serviços permitidos.</p>
    </main>
  );
}
