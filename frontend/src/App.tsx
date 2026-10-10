import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'

// Pages are code-split; Recharts in particular only loads with the dashboard.
const DashboardPage = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })))
const TransactionsPage = lazy(() => import('@/pages/transactions').then((m) => ({ default: m.TransactionsPage })))
const CategorizePage = lazy(() => import('@/pages/categorize').then((m) => ({ default: m.CategorizePage })))
const ImportPage = lazy(() => import('@/pages/import').then((m) => ({ default: m.ImportPage })))
const RulesPage = lazy(() => import('@/pages/rules').then((m) => ({ default: m.RulesPage })))

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="categorize" element={<CategorizePage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="settings/rules" element={<RulesPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
