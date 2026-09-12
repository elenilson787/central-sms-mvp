import Link from "next/link";
import styles from "../legal.module.css";

export default function PrivacyPage() {
  return <main className={styles.page}><article className={styles.card}>
    <h1 className={styles.title}>Política de Privacidade — Central SMS</h1>
    <p className={styles.updated}>Versão inicial para pré-lançamento · 12/09/2026</p>

    <section className={styles.section}><h2>Dados usados pela Central SMS</h2><p>A Mini App utiliza os dados assinados pelo Telegram necessários para identificar a sessão, como ID do usuário, nome e nome de usuário quando disponíveis. Também são armazenados saldo, transações da carteira, ativações, status de pagamentos e registros operacionais de auditoria.</p></section>
    <section className={styles.section}><h2>Dados de pagamento</h2><p>Para criar uma cobrança PIX, e-mail e CPF/CNPJ informados pelo pagador são enviados ao Mercado Pago. A Central SMS não grava esses campos nas tabelas de pagamento do aplicativo. São armazenados identificadores técnicos da cobrança, valor, status e datas necessários para conciliação e suporte.</p></section>
    <section className={styles.section}><h2>Segurança e prevenção de abuso</h2><p>Podem ser mantidos logs técnicos e identificadores derivados para rate limiting, auditoria, prevenção de duplicidade, diagnóstico de falhas e segurança. Tokens, chaves secretas e credenciais de provedores não devem ser armazenados em logs de usuário.</p></section>
    <section className={styles.section}><h2>Compartilhamento</h2><p>Dados são enviados apenas aos serviços necessários para executar a operação solicitada, como Telegram, Mercado Pago e, quando habilitados, provedores de números virtuais. Cada terceiro possui suas próprias políticas e obrigações.</p></section>
    <section className={styles.section}><h2>Retenção e suporte</h2><p>Registros financeiros e de auditoria podem ser mantidos pelo período necessário para segurança, suporte, prevenção de fraude e obrigações legais. Solicitações relacionadas a dados devem ser feitas pelo canal de suporte.</p></section>
    <div className={styles.notice}>Esta é a versão operacional de pré-lançamento. Antes da abertura comercial ampla, a política deve ser revisada conforme a estrutura jurídica e fiscal efetivamente utilizada pelo negócio.</div>

    <nav className={styles.links}><Link href="/terms">Termos</Link><Link href="/refund-policy">Reembolsos</Link><Link href="/support">Suporte</Link></nav>
  </article></main>;
}
