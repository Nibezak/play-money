import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { CommentNotFoundError } from '@slimefish/comments/lib/exceptions'
import { getSiteActivity } from '@slimefish/finance/lib/getSiteActivity'
import type schema from './schema'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request): Promise<SchemaResponse<typeof schema.get.responses>> {
  try {
    const data = await getSiteActivity({})

    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof CommentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
