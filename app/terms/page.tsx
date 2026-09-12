import Link from "next/link";
import styles from "../legal.module.css";

export default function TermsPage() {
  return <main className={styles.page}><article className={styles.card}>
    <h1 className={styles.title}>Termos de Uso — Central SMS</h1>
    <p className={styles.updated}>Versão inicial para pré-lançamento · 12/09/2026</p>

    <section className={styles.section}><h2>1. Serviço</h2><p>A Central SMS oferece uma interface para consultar, adquirir e acompanhar números virtuais e recebimentos de SMS fornecidos por provedores terceiros. A disponibilidade, duração, país, operadora e compatibilidade dependem do provedor e do serviço escolhido.</p></section>
    <section className={styles.section}><h2>2. Uso permitido</h2><p>O serviço deve ser usado somente para finalidades lícitas e compatíveis com os termos do provedor e da plataforma de destino.</p><div className={styles.danger}>É proibido utilizar a Central SMS para fraude, spam, criação abusiva de contas, evasão de bloqueios ou limites, falsificação de identidade, burla de KYC/CAPTCHA, invasão, golpes ou qualquer atividade ilegal.</div></section>
    <section className={styles.section}><h2>3. Serviços de terceiros</h2><p>A Central SMS não controla as regras das plataformas que recebem o número virtual. Um número pode deixar de ser aceito por uma plataforma, país ou serviço sem aviso prévio. Nenhuma compatibilidade permanente é garantida.</p></section>
    <section className={styles.section}><h2>4. Saldo e pagamentos</h2><p>Recargas via PIX somente são creditadas após confirmação do processador de pagamento. O saldo da carteira é registrado em ledger transacional. Tentativas repetidas do mesmo evento não devem gerar crédito duplicado.</p></section>
    <section className={styles.section}><h2>5. Compras e cancelamentos</h2><p>Quando compras reais forem habilitadas, cada ativação seguirá as condições do provedor correspondente. Pedidos já concluídos ou que tenham recebido SMS podem não ser elegíveis a cancelamento ou reembolso. Em caso de falha do provedor antes da entrega, a Central SMS buscará cancelar ou estornar conforme as regras aplicáveis.</p></section>
    <section className={styles.section}><h2>6. Segurança da conta</h2><p>O acesso à Mini App é vinculado à identidade assinada pelo Telegram. O usuário é responsável pela segurança da própria conta do Telegram e por não compartilhar acessos.</p></section>
    <section className={styles.section}><h2>7. Alterações</h2><p>Estes termos podem ser atualizados antes do lançamento comercial definitivo. Mudanças relevantes devem ser comunicadas pela interface ou pelo bot.</p></section>

    <nav className={styles.links}><Link href="/privacy">Privacidade</Link><Link href="/refund-policy">Reembolsos</Link><Link href="/support">Suporte</Link></nav>
  </article></main>;
}
