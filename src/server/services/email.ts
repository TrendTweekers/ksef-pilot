import { env } from "../config/env.js";

interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export function resendConfigured() {
  return Boolean(env.RESEND_API_KEY);
}

export async function sendEmail(input: SendEmailInput) {
  if (!env.RESEND_API_KEY) {
    throw new Error("Resend API key is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content:
          typeof attachment.content === "string"
            ? Buffer.from(attachment.content, "utf8").toString("base64")
            : attachment.content.toString("base64"),
        content_type: attachment.contentType
      }))
    })
  });

  const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? "Resend rejected the email request.");
  }

  return { id: payload.id ?? null };
}
