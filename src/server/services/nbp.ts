import { prisma } from "../config/prisma.js";

interface NbpRateResponse {
  table: string;
  currency: string;
  code: string;
  rates: Array<{
    no: string;
    effectiveDate: string;
    mid: number;
  }>;
}

export interface NbpExchangeRateResult {
  currency: string;
  rate: number;
  rateDate: string;
  tableNo: string;
  source: "cache" | "nbp";
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeCurrency(currency: string) {
  return currency.trim().toUpperCase();
}

async function fetchNbpTableARate(currency: string, date: string) {
  const response = await fetch(`https://api.nbp.pl/api/exchangerates/rates/A/${currency}/${date}/?format=json`, {
    headers: { Accept: "application/json" }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`NBP rate lookup failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as NbpRateResponse;
  const rate = payload.rates[0];

  if (!rate?.effectiveDate || !Number.isFinite(rate.mid)) {
    throw new Error("NBP returned an invalid exchange-rate payload.");
  }

  return {
    currency,
    rate: rate.mid,
    rateDate: rate.effectiveDate,
    tableNo: rate.no
  };
}

export async function getNbpTableARateForPreviousBusinessDay(currencyInput: string, dateInput: Date): Promise<NbpExchangeRateResult | null> {
  const currency = normalizeCurrency(currencyInput);

  if (currency === "PLN") {
    return {
      currency,
      rate: 1,
      rateDate: dateOnly(dateInput),
      tableNo: "PLN",
      source: "cache"
    };
  }

  let candidate = addDays(dateInput, -1);

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const candidateDate = dateOnly(candidate);
    const cached = await prisma.nbpExchangeRate.findUnique({
      where: { currency_rateDate: { currency, rateDate: startOfUtcDay(candidateDate) } }
    });

    if (cached) {
      return {
        currency,
        rate: Number(cached.rate),
        rateDate: dateOnly(cached.rateDate),
        tableNo: cached.tableNo,
        source: "cache"
      };
    }

    const fresh = await fetchNbpTableARate(currency, candidateDate);

    if (fresh) {
      await prisma.nbpExchangeRate.upsert({
        where: { currency_rateDate: { currency, rateDate: startOfUtcDay(fresh.rateDate) } },
        create: {
          currency,
          rateDate: startOfUtcDay(fresh.rateDate),
          tableNo: fresh.tableNo,
          rate: fresh.rate
        },
        update: {
          tableNo: fresh.tableNo,
          rate: fresh.rate,
          fetchedAt: new Date()
        }
      });

      return { ...fresh, source: "nbp" };
    }

    candidate = addDays(candidate, -1);
  }

  return null;
}
