'use client'

import { useUserStats } from '@slimefish/api-helpers/client/hooks'
import { useUser } from '@slimefish/users/context/UserContext'
import { QuestCard } from './QuestCard'

export function UserQuestCard() {
  const { user } = useUser()
  const { data: statsData } = useUserStats({ userId: user?.id ?? '', skip: !user })
  const data = statsData?.data

  return user && data?.quests.length ? <QuestCard quests={data.quests} /> : null
}
