import { NextResponse } from 'next/server'
import { type SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { updateNotificationsRead } from '@slimefish/notifications/lib/updateNotificationsRead'
import schema from './schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<SchemaResponse<typeof schema.post.responses>> {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as unknown
    const { resourceId, resourceType } = schema.post.requestBody.parse(body)

    if (resourceType === 'MARKET') {
      await updateNotificationsRead({ userId, marketId: resourceId })
    } else if (resourceType === 'LIST') {
      await updateNotificationsRead({ userId, listId: resourceId })
    }

    return NextResponse.json({ data: { success: true } })
  } catch (error: unknown) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging

    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
