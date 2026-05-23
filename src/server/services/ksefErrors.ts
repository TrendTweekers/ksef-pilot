export interface KsefTranslatedError {
  technicalCode: string;
  label: string;
  userMessage: string;
  suggestion: string;
  severity: "blocking" | "warning";
  retryable: boolean;
}

const errorMap: Record<string, Omit<KsefTranslatedError, "technicalCode">> = {
  ERR_KSEF_001: {
    label: "KSeF token problem",
    userMessage: "The KSeF token is invalid, expired, or does not match the seller NIP.",
    suggestion: "Generate a fresh token in the Polish tax portal and save it again in KSeF Settings.",
    severity: "blocking",
    retryable: false
  },
  ERR_KSEF_002: {
    label: "Duplicate invoice",
    userMessage: "KSeF already has an invoice with this seller, type, and invoice number.",
    suggestion: "Check whether this order was already submitted. For changes, create a correction invoice.",
    severity: "blocking",
    retryable: false
  },
  ERR_KSEF_003: {
    label: "KSeF rate limit",
    userMessage: "KSeF is rate limiting requests right now.",
    suggestion: "KSeF Pilot will retry automatically after a short delay.",
    severity: "warning",
    retryable: true
  },
  ERR_KSEF_004: {
    label: "KSeF unavailable",
    userMessage: "KSeF is temporarily unavailable or returned a server error.",
    suggestion: "KSeF Pilot will retry automatically with backoff.",
    severity: "warning",
    retryable: true
  },
  ERR_KSEF_005: {
    label: "FA(3) XML validation failed",
    userMessage: "The generated FA(3) XML did not pass KSeF validation.",
    suggestion: "Review buyer NIP, seller details, line items, VAT and totals before submitting again.",
    severity: "blocking",
    retryable: false
  },
  ERR_KSEF_006: {
    label: "Missing KSeF permission",
    userMessage: "The token is not allowed to submit invoices for this seller NIP.",
    suggestion: "Create the token for the right seller/company context in the tax portal.",
    severity: "blocking",
    retryable: false
  }
};

export function translateKsefError(technicalCode: string): KsefTranslatedError {
  return {
    technicalCode,
    ...(errorMap[technicalCode] ?? {
      label: technicalCode,
      userMessage: "KSeF returned an unexpected error.",
      suggestion: "Try again later or contact support with this error code.",
      severity: "blocking" as const,
      retryable: false
    })
  };
}
