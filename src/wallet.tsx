// Shared, persistent fake-money wallet for the whole game hub. The balance is in
// USD, persisted to localStorage, and used by every game (Pusoy Trese first).
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

const STORAGE_KEY = 'card-hub-wallet'
export const STARTING_BALANCE = 1000

interface WalletContextValue {
  balance: number
  adjust: (delta: number) => void
  setBalance: (value: number) => void
  reset: () => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

function loadBalance(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw != null) {
      const n = Number(raw)
      if (Number.isFinite(n)) return n
    }
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return STARTING_BALANCE
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [balance, setBalanceState] = useState<number>(loadBalance)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(balance))
    } catch {
      /* ignore write failures */
    }
  }, [balance])

  const value: WalletContextValue = {
    balance,
    adjust: (delta) => setBalanceState((b) => b + delta),
    setBalance: (v) => setBalanceState(v),
    reset: () => setBalanceState(STARTING_BALANCE),
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

// Format a USD amount, e.g. 1000 -> "$1,000", -250 -> "-$250".
export const formatUSD = (n: number) => usd.format(n)

// Signed format for deltas, e.g. +60 -> "+$60", -45 -> "-$45".
export const formatDelta = (n: number) =>
  n > 0 ? `+${usd.format(n)}` : usd.format(n)

// Compact USD for tight spaces, e.g. 1000 -> "$1K", 100000 -> "$100K",
// 5_000_000 -> "$5M". Drops trailing ".0" (10000 -> "$10K", not "$10.0K").
export const formatCompactUSD = (n: number) => {
  const compact = (v: number, suffix: string) =>
    `$${Number((n / v).toFixed(1))}${suffix}`
  if (Math.abs(n) >= 1_000_000) return compact(1_000_000, 'M')
  if (Math.abs(n) >= 1_000) return compact(1_000, 'K')
  return `$${n}`
}
