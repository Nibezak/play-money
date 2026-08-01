import { PrismaClient } from '@prisma/client'
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended'
import db from '@slimefish/database'

const _ = jest.requireActual('lodash')
global._ = _

jest.mock('@slimefish/database', () => {
  const original = jest.requireActual('@slimefish/database')

  return {
    __esModule: true,
    ...original,
    default: mockDeep<PrismaClient>(),
  }
})

beforeEach(() => {
  mockReset(dbMock)
})

export const dbMock = db as unknown as DeepMockProxy<PrismaClient>
