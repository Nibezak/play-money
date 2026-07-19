import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Tellwise AI translations sync handles AI event translations.
  // We return success to satisfy the Tellwise cron job until AI Translations are ported.
  return NextResponse.json({ success: true, message: 'AI Translations will be implemented later' })
}
