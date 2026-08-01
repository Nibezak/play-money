import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { createComment } from '@slimefish/comments/lib/createComment'
import schema from './schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<SchemaResponse<typeof schema.post.responses>> {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as unknown
    const data = schema.post.requestBody.parse(body)

    const comment = await createComment({ ...data, authorId: userId })

    return NextResponse.json({ data: comment })
  } catch (error: any) {
    console.error('Comment error:', error) // eslint-disable-line no-console
    return NextResponse.json({ error: error?.message || 'Error processing request' }, { status: 500 })
  }
}
