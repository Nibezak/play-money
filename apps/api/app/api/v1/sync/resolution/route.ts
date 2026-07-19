import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Tellwise UMA resolution sync is no longer needed since Play-Money AMM resolves natively.
  // We return success to satisfy the Tellwise cron job.
  return NextResponse.json({ success: true, message: 'Resolution is handled natively by Play-Money AMM' })
}
