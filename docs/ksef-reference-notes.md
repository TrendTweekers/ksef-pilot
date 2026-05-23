# KSeF Reference Notes

Reference sources reviewed for KSeF Pilot:

- FakturaFlow cockpit zip: `C:/Users/User/Pictures/faktura-flow-cockpit-main.zip`
- Official CIRFMF GitHub organization: `https://github.com/CIRFMF`
- Official KSeF API docs: `https://api.ksef.mf.gov.pl/`

## Useful FakturaFlow Pieces

- `src/services/ksefXmlService.ts`: best local reference for FA(3) XML generation.
- `supabase/functions/ksef-submit/index.ts`: reference for KSeF 2.0 token auth, AES encryption, session open, invoice send, and session close.
- `supabase/functions/ksef-upo/index.ts`: reference for UPO retrieval. Important: KSeF 2.0 UPO lookup needs the original session reference.
- `supabase/functions/ksef-queue-worker/index.ts`: reference for retries, stale processing cleanup, and one-invoice-per-seller pacing.
- `src/services/ksef/errorTranslator.ts`: useful merchant-facing error translation patterns.

## Decisions For Shopify App

- Keep KSeF Pilot simple for everyday Shopify merchants. Do not copy the accounting-office cockpit UI.
- Use FA(3) generation logic and KSeF flow learnings from FakturaFlow.
- Use Shopify order data as the source, with manual B2B/NIP flags in MVP.
- Keep FakturaFlow as the trust/brand layer: "Built by FakturaFlow."

## FA(3) Notes To Preserve

- Use namespace `http://crd.gov.pl/wzor/2025/06/25/13775/` for FA(3).
- `P_1M` is place of issue, not date.
- At line level, `P_8B` is quantity, `P_9A` is unit net price, `P_11` is line net amount, and `P_12` is VAT rate.
- FA(3) element order matters: summary totals and annotations come before `FaWiersz`.
- For MVP, support only PLN and standard Polish 23% VAT.
