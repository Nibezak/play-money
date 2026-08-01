'use client'

import React from 'react'
import { Button } from '@slimefish/ui/button'
import { cn } from '@slimefish/ui/utils'
import { GlobalSearchMenu } from './GlobalSearchMenu'

export function GlobalSearchTrigger({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return (
    <>
      <Button
        className={cn('justify-between gap-4 font-normal text-muted-foreground md:w-[200px]', className)}
        variant="outline"
        onClick={() => setOpen(true)}
      >
        Search...
        <kbd className="pointer-events-none right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <GlobalSearchMenu open={open} onOpenChange={setOpen} />
    </>
  )
}
