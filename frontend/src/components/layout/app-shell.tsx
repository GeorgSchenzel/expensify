import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { QueryState } from '@/components/query-state'
import { Sidebar } from './sidebar'
import { MobileNav } from './mobile-nav'

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Desktop sidebar */}
      <Sidebar className="hidden lg:flex" />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className="flex items-center h-14 px-4 border-b border-border bg-white lg:hidden">
          <MobileNav />
          <span className="ml-3 font-semibold text-sm tracking-tight">Expensify</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {/* Keeps the shell visible while a lazily loaded page arrives */}
          <Suspense fallback={<QueryState />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
