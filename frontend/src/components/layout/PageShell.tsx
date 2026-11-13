import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Sticky page header with left padding so titles clear the mobile hamburger. */
export const pageHeaderClass =
  'border-b bg-background sticky top-0 z-10 py-4 pr-4 pl-16 sm:py-6 sm:pr-6 lg:pl-6'

/** Standard scrollable page body padding. */
export const pageBodyClass = 'flex-1 overflow-auto p-4 sm:p-6'

/** Touch-friendly primary action height on mobile. */
export const mobileActionClass = 'h-11 px-4 text-base sm:h-9 sm:text-sm'

export function PageHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(pageHeaderClass, className)} {...props}>
      {children}
    </div>
  )
}

/** Horizontal scroll wrapper for dense tables on small screens. */
export function TableScroll({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)} {...props}>
      {children}
    </div>
  )
}
