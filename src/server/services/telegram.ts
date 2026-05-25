import { env } from "../config/env.js";

const appPrefix = "KSeF Pilot";

export async function notifyTelegram(message: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return;
  }

  const text = message.startsWith(appPrefix) ? message : `${appPrefix} - ${message}`;

  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true
      })
    });
  } catch (error) {
    console.warn("Telegram notification failed", error);
  }
}
