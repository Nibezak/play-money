import { redirect } from 'next/navigation'
import React from 'react'
import { getMyReferrals } from '@slimefish/api-helpers/client'
import { auth } from '@slimefish/auth'
import { SettingsReferralPage } from '@slimefish/referrals/components/SettingsReferralPage'

export default async function AppSettingsPage() {
  const session = await auth()

  if (!session) {
    redirect('/login?redirect=/settings/referrals')
  }

  const { data: referrals } = await getMyReferrals()

  return <SettingsReferralPage referrals={referrals} />
}
