import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { createList } from '@slimefish/lists/lib/createList'
import { createMarket } from '@slimefish/markets/lib/createMarket'
import { getMarkets } from '@slimefish/markets/lib/getMarkets'
import { getUserById } from '@slimefish/users/lib/getUserById'
import { isAdmin } from '@slimefish/users/rules'
import schema from './schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<SchemaResponse<typeof schema.get.responses>> {
  try {
    const url = new URL(req.url)
    const searchParams = new URLSearchParams(url.search)
    const params = Object.fromEntries(searchParams)

    const { status = 'active', createdBy, tags, ...paginationParams } = schema.get.parameters.parse(params) ?? {}

    const results = await getMarkets({ createdBy, tags, status }, paginationParams)

    return NextResponse.json(results)
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}

export const maxDuration = 60 // Extend max duration for creating lists with lots of markets.

export async function POST(req: Request): Promise<SchemaResponse<typeof schema.post.responses>> {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserById({ id: userId })
    if (!isAdmin({ user })) {
      return NextResponse.json({ error: 'Unauthorized: Only admins can create markets' }, { status: 401 })
    }

    const body = (await req.json()) as unknown
    const basicMarket = schema.post.requestBody.parse(body)

    switch (basicMarket.type) {
      case 'binary':
      case 'multi': {
        const newMarket = await createMarket({
          ...basicMarket,
          createdBy: userId,
        })
        return NextResponse.json({ data: { market: newMarket } })
      }
      case 'list': {
        const newList = await createList({
          ...basicMarket,
          ownerId: userId,
          title: basicMarket.question,
          markets: basicMarket.options,
          contributionPolicy: basicMarket.contributionPolicy || 'OWNERS_ONLY',
        })
        return NextResponse.json({ data: { list: newList } })
      }
    }
  } catch (error: unknown) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Failed to create market' }, { status: 500 })
  }
}
