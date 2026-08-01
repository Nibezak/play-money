import { NextResponse } from 'next/server'
import type { SchemaResponse } from '@slimefish/api-helpers'
import { UserNotFoundError } from '@slimefish/users/lib/exceptions'
import { getUserById } from '@slimefish/users/lib/getUserById'
import schema from './schema'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: unknown }
): Promise<SchemaResponse<typeof schema.get.responses>> {
  try {
    const { id } = schema.get.parameters.parse(params)

    const user = await getUserById({ id })

    return NextResponse.json({ data: user })
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging

    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
