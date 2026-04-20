/**
 * Centralized currency formatting utilities for the Lexio platform.
 *
 * Default currency is BRL (Brazilian Real).
 * All monetary values stored internally in USD are converted to BRL for display
 * using a reference exchange rate.
 */

/** Default exchange rate BRL per USD (reference). */
export const DEFAULT_BRL_PER_USD = 5.7

/** Supported currencies. */
export type CurrencyCode = 'BRL' | 'USD' | 'EUR'

// ── Intl formatters (cached) ──────────────────────────────────────────────────

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 5 })
const eurFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' })
const intFormatter = new Intl.NumberFormat('pt-BR')
const percentFormatter = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

// ── Core formatters ───────────────────────────────────────────────────────────

/**
 * Format a value in BRL.
 * If the input is in USD, convert first with `usdToBrl()`.
 */
export function fmtBrl(value: number): string {
  return brlFormatter.format(value)
}

/**
 * Format a value in USD (kept for pages that show explicit USD columns).
 */
export function fmtUsd(value: number): string {
  if (value < 0.001) return `$${value.toFixed(5)}`
  return `$${value.toFixed(4)}`
}

/** Format an integer or decimal number using pt-BR locale. */
export function fmtInt(value: number): string {
  return intFormatter.format(value)
}

/** Format a ratio (0–1) as a percent string, e.g. 0.85 → "85,0%". */
export function fmtPercent(value: number): string {
  return percentFormatter.format(value)
}

// ── Conversion helpers ────────────────────────────────────────────────────────

/** Convert USD to BRL using the given exchange rate. */
export function usdToBrl(usd: number, rate: number = DEFAULT_BRL_PER_USD): number {
  return usd * rate
}

// ── High-level cost formatter ─────────────────────────────────────────────────

/**
 * Format a cost that is stored in USD, converting to BRL by default.
 *
 * @param usd       The cost in US dollars (may be null/undefined/NaN).
 * @param currency  Target display currency (default: 'BRL').
 * @param rate      Exchange rate for BRL conversion (default: DEFAULT_BRL_PER_USD).
 * @returns         Human-readable cost string, or em-dash for missing values.
 */
export function formatCost(
  usd: number | null | undefined,
  currency: CurrencyCode = 'BRL',
  rate: number = DEFAULT_BRL_PER_USD,
): string {
  if (usd == null || Number.isNaN(usd)) return '—'

  switch (currency) {
    case 'BRL':
      return fmtBrl(usd * rate)
    case 'USD':
      return fmtUsd(usd)
    case 'EUR':
      return eurFormatter.format(usd * rate * 0.17) // rough placeholder
    default:
      return fmtBrl(usd * rate)
  }
}

/**
 * Format a small inline cost label (e.g. pipeline step cost badges).
 * Always returns BRL by default.
 */
export function formatCostBadge(
  costUsd: number,
  rate: number = DEFAULT_BRL_PER_USD,
): string {
  const brl = costUsd * rate
  return fmtBrl(brl)
}
