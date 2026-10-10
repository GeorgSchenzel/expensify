import { NavLink } from 'react-router'
import {
  LayoutDashboard,
  ArrowDownUp,
  Upload,
  Settings,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ArrowDownUp },
  { href: '/import', label: 'Import CSV', icon: Upload },
  { href: '/settings/rules', label: 'Rules & Categories', icon: Settings },
]

interface SidebarProps {
  className?: string
  onNavigate?: () => void
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex flex-col w-56 min-h-screen bg-white border-r border-border',
        className
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 h-14 px-4 border-b border-border">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-neutral-900">
          <Wallet className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sm tracking-tight">Expensify</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            to={href}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-neutral-100 text-neutral-900'
                  : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground">Personal Finance</p>
      </div>
    </aside>
  )
}
