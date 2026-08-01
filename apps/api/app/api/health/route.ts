import { NextResponse } from 'next/server'
import os from 'node:os'
import db from '@slimefish/database'

export async function GET() {
  const startTime = Date.now()
  const healthCheck = {
    message: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    databaseStatus: 'OK',
    databaseResponseTime: Infinity,
    responseTime: Infinity,
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    freeMemory: os.freemem(),
    totalMemory: os.totalmem(),
  }

  try {
    // Check database connection and response time
    const dbStartTime = Date.now()
    await db.$queryRaw`SELECT 1`
    healthCheck.databaseResponseTime = Date.now() - dbStartTime

    healthCheck.responseTime = Date.now() - startTime

    return NextResponse.json(healthCheck)
  } catch (error) {
    console.error('Health check failed:', error) // eslint-disable-line no-console -- Log error to console
    healthCheck.message = 'FAIL'
    healthCheck.databaseStatus = 'FAIL'
    healthCheck.responseTime = Date.now() - startTime
    return NextResponse.json(healthCheck, { status: 500 })
  }
}
