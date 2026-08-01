import { NextResponse } from 'next/server'
import { getAuthUser } from '@slimefish/auth/lib/getAuthUser'
import db from '@slimefish/database'
import { getUserById } from '@slimefish/users/lib/getUserById'
import { isAdmin } from '@slimefish/users/rules'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const settings = await db.setting.findMany()
    return NextResponse.json({ data: settings })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await getUserById({ id: userId })
    if (!isAdmin({ user })) {
      return NextResponse.json({ error: 'Unauthorized: Only admins can manage settings' }, { status: 401 })
    }

    const body = await req.json()
    const { settings } = body

    if (!Array.isArray(settings)) {
      return NextResponse.json({ error: 'Expected an array of settings' }, { status: 400 })
    }

    const results = []
    for (const setting of settings) {
      const { group, key, value } = setting
      if (typeof group !== 'string' || typeof key !== 'string' || typeof value !== 'string') {
        return NextResponse.json({ error: 'Invalid setting payload' }, { status: 400 })
      }
      if (group === 'fees' && key === 'amm_trade_fee_bps') {
        const feeBps = Number.parseInt(value, 10)
        if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 900) {
          return NextResponse.json({ error: 'AMM trade fee must be between 0 and 900 basis points' }, { status: 400 })
        }
      }
      const result = await db.setting.upsert({
        where: { group_key: { group, key } },
        create: { group, key, value },
        update: { value },
      })
      results.push(result)
    }

    return NextResponse.json({ data: results })
  } catch (error) {
    console.log(error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Error processing request' }, { status: 500 })
  }
}
