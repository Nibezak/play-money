import { useEffect } from 'react'
import { mutate } from 'swr'
import { createMyResourceViewed } from '@slimefish/api-helpers/client'
import { MY_NOTIFICATIONS_PATH } from '@slimefish/api-helpers/client/hooks'
import { useUser } from '@slimefish/users/context/UserContext'

export function useTrackResourceViewed({ resourceId, resourceType }: { resourceId: string; resourceType: string }) {
  const { user } = useUser()

  useEffect(() => {
    const trackView = async () => {
      if (user) {
        try {
          await createMyResourceViewed({
            resourceId,
            resourceType,
          })

          void mutate(MY_NOTIFICATIONS_PATH)
        } catch (error) {
          console.error('Error tracking view:', error)
        }
      }
    }

    trackView()
  }, [user, resourceId])
}
