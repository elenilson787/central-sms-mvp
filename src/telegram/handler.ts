export type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number };
    from?: { id?: number };
  };
};

/**
 * Telegram update boundary for bootstrap/CI.
 * Command handling will be implemented in a dedicated feature branch after
 * the database and bot secrets are configured.
 */
export async function handleTelegramUpdate(_update: TelegramUpdate) {
  return { ok: true, handled: false };
}
