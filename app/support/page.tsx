import Link from "next/link";
import styles from "../legal.module.css";

export default function SupportPage() {
  return <main className={styles.page}><article className={styles.card}>
    <h1 className={styles.title}>Suporte — Central SMS</h1>
    <p className={styles.updated}>Canal operacional de pré-lançamento</p>

    <section className={styles.section}><h2>Como pedir ajuda</h2><p>Abra o bot <strong>@CentralSMSBrasilBot</strong> no Telegram e use o comando <strong>/ajuda</strong>. Para problemas com recarga, informe o valor, horário aproximado e seu nome de usuário do Telegram.</p></section>
    <section className={styles.section}><h2>Segurança</h2><div className={styles.danger}>Nunca envie senha, código recebido por SMS, Access Token, chave PIX, cartão completo, token do Telegram ou qualquer credencial secreta para o suporte.</div></section>
    <section className={styles.section}><h2>Pagamentos</h2><p>Se uma recarga PIX estiver aprovada no Mercado Pago e ainda não aparecer na carteira, aguarde alguns instantes e abra novamente a área de recarga. O sistema realiza reconciliação automática e idempotente.</p></section>
    <section className={styles.section}><h2>Ativações</h2><p>Compras reais de números permanecerão indisponíveis até a integração comercial com o provedor ser validada. O catálogo pode exibir itens de demonstração durante o pré-lançamento.</p></section>

    <nav className={styles.links}><Link href="/terms">Termos</Link><Link href="/privacy">Privacidade</Link><Link href="/refund-policy">Reembolsos</Link></nav>
  </article></main>;
}
