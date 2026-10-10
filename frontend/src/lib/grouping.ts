// Groups uncategorized transactions by merchant-like keyword and suggests
// rule patterns. Display-only heuristics: the actual match counts always come
// from the backend's rule preview.

import type { Transaction } from './types'

/** Bank boilerplate that says nothing about the merchant. */
const STOPWORDS = new Set([
  // German / Austrian bank exports
  'pos', 'um', 'dankt', 'zahlung', 'zahlungsauftrag', 'zahlungsreferenz', 'auftraggeberreferenz',
  'verwendungszweck', 'lastschrift', 'gutschrift', 'überweisung', 'ueberweisung', 'dauerauftrag',
  'kartenzahlung', 'bankomat', 'mobile', 'iban', 'bic', 'ref', 'referenz', 'mandat', 'creditor',
  'sepa', 'eur', 'at', 'de', 'und', 'der', 'die', 'das', 'für', 'fuer', 'von', 'mit', 'gmbh', 'ag',
  'kg', 'wien', 'graz', 'linz', 'salzburg',
  // English
  'payment', 'purchase', 'card', 'debit', 'credit', 'transfer', 'to', 'from', 'the', 'and', 'of',
  'for', 'ltd', 'inc', 'llc', 'online', 'www', 'com',
])

/** Lowercased words of a description without numbers, codes and boilerplate. */
export function keywords(description: string): string[] {
  return description
    .toLowerCase()
    .split(/[^\p{L}\p{N}&]+/u)
    .filter((t) => t.length >= 2 && !/\d/.test(t) && !STOPWORDS.has(t))
}

export interface TransactionGroup {
  /** Leading keyword shared by the group, or '' for descriptions without one. */
  key: string
  /** Suggested CONTAINS pattern (a substring of every description in the group). */
  pattern: string
  transactions: Transaction[]
  /** Signed sum of amounts. */
  total: number
}

function suggestPattern(key: string, txs: Transaction[]): string {
  if (key.length >= 4) return key
  // Short keys ("dm", "öbb") are ambiguous; extend with the next word when
  // every description contains the two-word phrase.
  const second = keywords(txs[0].description)[1]
  if (second) {
    const phrase = `${key} ${second}`
    if (txs.every((t) => t.description.toLowerCase().includes(phrase))) return phrase
  }
  return key
}

/** Largest groups first: those are the rules that cover the most rows. */
export function groupTransactions(txs: Transaction[]): TransactionGroup[] {
  const byKey = new Map<string, Transaction[]>()
  for (const t of txs) {
    const key = keywords(t.description)[0] ?? ''
    const list = byKey.get(key)
    if (list) list.push(t)
    else byKey.set(key, [t])
  }
  return [...byKey.entries()]
    .map(([key, list]) => ({
      key,
      pattern: key ? suggestPattern(key, list) : '',
      transactions: [...list].sort((a, b) => b.date.localeCompare(a.date)),
      total: list.reduce((sum, t) => sum + t.amount, 0),
    }))
    .sort(
      (a, b) =>
        Number(a.key === '') - Number(b.key === '') ||
        b.transactions.length - a.transactions.length ||
        Math.abs(b.total) - Math.abs(a.total) ||
        a.key.localeCompare(b.key)
    )
}

export interface KeywordSuggestion {
  keyword: string
  /** Number of transactions whose description contains the word. */
  count: number
}

/** Words that appear in the most descriptions (at least twice). */
export function keywordSuggestions(txs: Transaction[], limit = 12): KeywordSuggestion[] {
  const counts = new Map<string, number>()
  for (const t of txs) {
    for (const word of new Set(keywords(t.description))) {
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([word, count]) => count >= 2 && word.length >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }))
}
