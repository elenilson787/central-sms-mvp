import Link from "next/link";
import styles from "../legal.module.css";

export default function RefundPolicyPage() {
  return <main className={styles.page}><article className={styles.card}>
    <h1 className={styles.title}>Política de Reembolso — Central SMS</h1>
    <p className={styles.updated}>Versão inicial para pré-lançamento · 12/09/2026</p>

    <section className={styles.section}><h2>Recargas PIX</h2><p>Uma recarga confirmada adiciona saldo à carteira da Central SMS. O reembolso ao meio de pagamento poderá ser solicitado enquanto o valor correspondente ainda estiver disponível e não tiver sido consumido em ativações ou outros serviços.</p></section>
    <section className={styles.section}><h2>Saldo já utilizado</h2><p>Se o saldo da recarga já tiver sido gasto total ou parcialmente, o reembolso integral da recarga poderá não ser possível. O sistema impede reembolsos que deixariam a carteira negativa.</p></section>
    <section className={styles.section}><h2>Ativações de números</h2><p>Quando compras reais forem habilitadas, cancelamento e estorno de ativações dependerão do estado do pedido e das regras do provedor. Em geral, pedidos ainda não concluídos e sem SMS recebido podem ser elegíveis a cancelamento; pedidos concluídos podem deixar de ser reembolsáveis.</p></section>
    <section className={styles.section}><h2>Processamento</h2><p>Reembolsos de PIX aprovados pela Central SMS são solicitados ao processador de pagamento. O prazo de disponibilização do valor ao pagador depende do Mercado Pago e da instituição financeira envolvida.</p></section>
    <section className={styles.section}><h2>Solicitação</h2><p>Entre em contato pelo suporte informando sua conta do Telegram, valor, data aproximada da recarga e o motivo. Nunca envie senha, token, código de SMS ou credenciais de pagamento.</p></section>

    <nav className={styles.links}><Link href="/terms">Termos</Link><Link href="/privacy">Privacidade</Link><Link href="/support">Suporte</Link></nav>
  </article></main>;
}
