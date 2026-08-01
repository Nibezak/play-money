import { NextResponse } from 'next/server'
import { stripUndefined, type SchemaResponse } from '@slimefish/api-helpers'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import { getList } from '@slimefish/lists/lib/getList'
import { updateList } from '@slimefish/lists/lib/updateList'
import { canModifyList } from '@slimefish/lists/rules'
import { getUserById } from '@slimefish/users/lib/getUserById'
import schema from './schema'

export const dynamic = 'force-dynamic'

// TODO: Look into a better way to handle mixing vercel params and search params together...
export async function GET(
  req: Request,
  { params: idParams }: { params: Record<string, unknown> }
): Promise<SchemaResponse<typeof schema.get.responses>> {
  try {
    const url = new URL(req.url)
    const searchParams = new URLSearchParams(url.search)
    const params = Object.fromEntries(searchParams)

    if (params.extended) {
      // TODO: Transform this within zod before parsing. This is a workaround for now.
      params.extended = (params.extended === 'true') as unknown as string
    }

    const { id, extended } = schema.get.parameters.parse({ ...params, ...idParams })

    const list = await getList({ id, extended })

    return NextResponse.json({ data: list })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: unknown }
): Promise<SchemaResponse<typeof schema.patch.responses>> {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = schema.patch.parameters.parse(params)
    const body = (await req.json()) as unknown
    const { title, description, tags, ownerId } = schema.patch.requestBody.transform(stripUndefined).parse(body)

    const list = await getList({ id })
    const user = await getUserById({ id: userId })

    if (!canModifyList({ list, user })) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updatedList = await updateList({ id, title, description, tags, ownerId })

    return NextResponse.json({ data: updatedList })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
