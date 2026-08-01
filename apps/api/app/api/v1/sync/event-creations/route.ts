import { NextResponse } from 'next/server'
import Decimal from 'decimal.js'
import db from '@slimefish/database'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { createMarket } from '@slimefish/markets/lib/createMarket'
import { publishFreshPublicMarketSnapshots } from '@slimefish/markets/lib/getMarketLiveSnapshot'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const secret = req.headers.get('x-tellwise-secret')
    if (!process.env.TELLWISE_SECRET || secret !== process.env.TELLWISE_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null) as any
    if (body?.title && body?.slug) {
      const userId = req.headers.get('x-tellwise-user-id')
      if (!userId) {
        return NextResponse.json({ error: 'Missing authenticated user.' }, { status: 401 })
      }

      const user = await db.user.findUnique({ where: { id: userId } })
      if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized: Only admins can create markets.' }, { status: 403 })
      }

      const existing = await db.event.findUnique({ where: { slug: body.slug } })
      if (existing) {
        return NextResponse.json({ error: 'An event with this slug already exists.' }, { status: 409 })
      }

      const initialLiquidity = Number(body.initialLiquidity)
      if (!Number.isFinite(initialLiquidity) || initialLiquidity <= 0) {
        return NextResponse.json({ error: 'Starting liquidity must be greater than $0.' }, { status: 400 })
      }

      const event = await db.event.create({
        data: {
          slug: body.slug,
          title: body.title,
          creator: userId,
          iconUrl: typeof body.eventImageUrl === 'string' && body.eventImageUrl ? body.eventImageUrl : '/images/branding/slimefish.png',
          status: 'active',
          marketMode: typeof body.marketMode === 'string' ? body.marketMode : 'binary',
          startDate: new Date(),
          endDate: body.endDateIso ? new Date(body.endDateIso) : null,
        },
      })

      try {
        const tags = Array.isArray(body.categories)
          ? body.categories.map((category: any) => category.slug).filter(Boolean).slice(0, 5)
          : []
        const closeDate = body.endDateIso ? new Date(body.endDateIso) : null
        const candidates = body.marketMode === 'binary' ? [] : (Array.isArray(body.options) ? body.options : [])
        const perMarketLiquidity = candidates.length > 0
          ? new Decimal(initialLiquidity).div(candidates.length)
          : new Decimal(initialLiquidity)
        const treasuryAccount = await getHouseAccount()
        const markets = []
        if (candidates.length > 0) {
          for (const [index, candidate] of candidates.entries()) {
            const yesProbability = new Decimal(1).div(candidates.length).toNumber()
            const market = await createMarket({
                question: candidate.question || `${candidate.title || candidate.shortName}: ${body.title}`,
                description: body.resolutionRules || 'No resolution rules provided.',
                closeDate,
                createdBy: userId,
                eventId: event.id,
                tags,
                options: [
                  { name: candidate.outcomeYes || 'Yes', color: '#22C55E', probability: yesProbability },
                  { name: candidate.outcomeNo || 'No', color: '#F43F5E', probability: 1 - yesProbability },
                ],
              subsidyAmount: perMarketLiquidity,
              liquidityAccountId: treasuryAccount.id,
            })
            markets.push({ ...market, candidateIndex: index, candidate: candidate.title || candidate.shortName })
          }
        }
        else {
          markets.push(await createMarket({
              question: body.binaryQuestion || body.title,
              description: body.resolutionRules || 'No resolution rules provided.',
              closeDate,
              createdBy: userId,
              eventId: event.id,
              tags,
              options: [
                { name: body.binaryOutcomeYes || 'Yes', color: '#22C55E', probability: 0.5 },
                { name: body.binaryOutcomeNo || 'No', color: '#F43F5E', probability: 0.5 },
            ],
            subsidyAmount: perMarketLiquidity,
            liquidityAccountId: treasuryAccount.id,
          }))
        }
        await publishFreshPublicMarketSnapshots(markets.map(market => market.id))
        return NextResponse.json({ success: true, event, market: markets[0], markets })
      }
      catch (error) {
        await db.event.delete({ where: { id: event.id } }).catch(() => undefined)
        throw error
      }
    }

    // Find drafts ready for deployment (status='scheduled' and deployAt <= now)
    // For simplicity right now, we'll just find 'pending' or 'scheduled'
    const pendingDrafts = await db.eventCreation.findMany({
      where: {
        status: { in: ['draft', 'scheduled', 'pending'] },
        // deployAt: { lte: new Date() } // We'll ignore time constraint for immediate testing
      },
      take: 5,
    })

    for (const draft of pendingDrafts) {
      // Mark as processing
      await db.eventCreation.update({
        where: { id: draft.id },
        data: { status: 'processing' },
      })

      try {
        const payload = draft.draftPayload as any || {}
        const question = draft.title || 'Untitled Market'
        const description = payload.resolutionRules || draft.resolutionRules || 'No description provided'
        
        // 1. Create the overarching Event
        const event = await db.event.create({
          data: {
            slug: draft.slug || `event-${draft.id}`,
            title: question,
            creator: draft.createdByUserId,
            status: 'active',
            marketMode: draft.marketMode || 'binary',
            startDate: draft.startAt,
            endDate: draft.endDate,
          }
        })

        // 2. Create the Market inside the Event
        // In Tellwise, options are usually binary 'Yes' / 'No' by default for single mode
        const options = payload.options || [
          { name: draft.binaryOutcomeYes || 'Yes', probability: 50 },
          { name: draft.binaryOutcomeNo || 'No', probability: 50 }
        ]

        await createMarket({
          question,
          description,
          closeDate: draft.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
          options: options.map((opt: any) => ({
            name: opt.name,
            color: opt.color || '#3b82f6',
            probability: opt.probability || 50
          })),
          tags: draft.categorySlugs || [],
          createdBy: draft.createdByUserId,
          eventId: event.id,
        })

        // 3. Mark as deployed
        await db.eventCreation.update({
          where: { id: draft.id },
          data: { status: 'deployed' },
        })

      } catch (err: any) {
        console.error(`Failed to deploy draft ${draft.id}:`, err)
        await db.eventCreation.update({
          where: { id: draft.id },
          data: { status: 'failed', resolutionRules: err.message }, // repurposing a text field temporarily for error log if needed
        })
      }
    }

    return NextResponse.json({ success: true, processed: pendingDrafts.length })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to sync event creations' }, { status: 500 })
  }
}
