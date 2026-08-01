import { CommentWithReactions } from '@slimefish/comments/lib/getComment'
import db from '@slimefish/database'

export async function getCommentsOnList({ listId }: { listId: string }): Promise<Array<CommentWithReactions>> {
  const comments = await db.comment.findMany({
    where: {
      entityType: 'LIST',
      entityId: listId,
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
