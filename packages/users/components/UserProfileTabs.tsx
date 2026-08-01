'use client'

import React from 'react'
import { useSearchParam } from '@slimefish/ui'
import { Tabs } from '@slimefish/ui/tabs'

export function UserProfileTabs({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useSearchParam('tab')

  return (
    <Tabs defaultValue={tab || 'overview'} onValueChange={setTab}>
      {children}
    </Tabs>
  )
}
