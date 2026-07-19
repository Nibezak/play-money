import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Tellwise CLOB volume sync is no longer needed since Play-Money AMM tracks volume natively.
  // We return success to satisfy the Tellwise cron job.
  return NextResponse.json({ success: true, message: 'Volume is handled natively by Play-Money AMM' })
}
