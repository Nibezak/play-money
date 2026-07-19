import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { SchemaResponse } from '@play-money/api-helpers'
import { auth } from '@play-money/auth'
import db from '@play-money/database'
import schema from './schema'

export async function POST(req: Request): Promise<SchemaResponse<typeof schema.post.responses>> {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as unknown
    const { name } = schema.post.requestBody.parse(body)

    const key = `pm_${randomBytes(32).toString('base64url')}`
    const keyHash = createHash('sha256').update(key).digest('hex')

    const apiKey = await db.apiKey.create({
      data: {
        name,
        key: keyHash,
        userId: session.user.id,
      },
    })

    return NextResponse.json({ data: { ...apiKey, key } } as any)
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging

    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}

export async function GET(): Promise<SchemaResponse<typeof schema.get.responses>> {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keys = await db.apiKey.findMany({
      where: {
        userId: session.user.id,
        isRevoked: false,
      },
    })

    return NextResponse.json({ data: keys.map(({ key: _key, ...item }) => ({ ...item, key: 'hidden' })) } as any)
  } catch (error) {
    console.log(error) // eslint-disable-line no-console -- Log error for debugging

    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
