import { getPaginatedItems, PaginationRequest } from '@slimefish/api-helpers'
import db, { List } from '@slimefish/database'

interface ListFilterOptions {
  ownerId?: string
}

export async function getLists(filters: ListFilterOptions = {}, pagination?: PaginationRequest) {
  return getPaginatedItems<List>({
    model: db.list,
    pagination: pagination ?? {},
    where: {
      ownerId: filters.ownerId,
    },
    include: {
      owner: true,
      markets: {
        include: {
          market: {
            include: {
              options: true,
              marketResolution: {
                include: {
                  resolution: true,
                  resolvedBy: true,
                },
              },
            },
          },
        },
      },
    },
  })
}
