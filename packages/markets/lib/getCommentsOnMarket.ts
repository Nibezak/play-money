import { CommentWithReactions } from '@slimefish/comments/lib/getComment'
import db from '@slimefish/database'

export async function getCommentsOnMarket({ marketId }: { marketId: string }): Promise<Array<CommentWithReactions>> {
  const comments = await db.comment.findMany({
    where: {
      entityType: 'MARKET',
      entityId: marketId,
    },
    include: {
      author: true,
      reactions: {
        include: {
          user: true,
        },
      },
    },
  })

  return comments
}
