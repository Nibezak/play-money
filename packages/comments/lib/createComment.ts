import db, { Comment } from '@slimefish/database'
import { getList } from '@slimefish/lists/lib/getList'
import { getMarket } from '@slimefish/markets/lib/getMarket'
import { getUniqueLiquidityProviderIds } from '@slimefish/markets/lib/getUniqueLiquidityProviderIds'
import { createNotification } from '@slimefish/notifications/lib/createNotification'

function extractUniqueMentionIds(htmlString: string): string[] {
  const mentionRegex = /<mention[^>]*data-id="([^"]*)"[^>]*>/g
  const uniqueIds = new Set<string>()

  let match
  while ((match = mentionRegex.exec(htmlString)) !== null) {
    if (match[1]) {
      uniqueIds.add(match[1])
    }
  }

  return Array.from(uniqueIds)
}

export function sanitizeCommentContent(content: string): string {
  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim()
}

export async function createComment({
  content,
  authorId,
  parentId,
  entityType,
  entityId,
}: Pick<Comment, 'content' | 'authorId' | 'parentId' | 'entityType' | 'entityId'>) {
  const trimmedContent = sanitizeCommentContent(content.replace(/<p><\/p>/g, ''))
  if (!trimmedContent) {
    throw new Error('Comment cannot be empty')
  }

  const comment = await db.comment.create({
    data: {
      content: trimmedContent,
      authorId,
      parentId,
      entityType,
      entityId,
    },
    include: {
      parent: true,
    },
  })

  let entity: any = null
  try {
    entity = entityType === 'MARKET' ? await getMarket({ id: entityId }) : await getList({ id: entityId })
  } catch {
    entity = { id: entityId, slug: entityId }
  }

  const userIdsMentioned = extractUniqueMentionIds(content)

  await Promise.all(
    userIdsMentioned.map(async (mentionedUserId) => {
      if (mentionedUserId === authorId) return

      await createNotification({
        type: 'COMMENT_MENTION',
        actorId: authorId,
        ...(entityType === 'MARKET' ? { marketId: entity.id } : { listId: entity.id }),
        commentId: comment.id,
        parentCommentId: parentId ?? undefined,
        groupKey: entity.id,
        userId: mentionedUserId,
        actionUrl: `/${entityType === 'MARKET' ? 'questions' : 'lists'}/${entity.id}/${entity.slug}#${comment.id}`,
      })
    })
  )

  if (
    parentId &&
    comment.parent &&
    authorId !== comment.parent?.authorId &&
    !userIdsMentioned.includes(comment.parent?.authorId)
  ) {
    await createNotification({
      type: 'COMMENT_REPLY',
      actorId: authorId,
      ...(entityType === 'MARKET' ? { marketId: entity.id } : { listId: entity.id }),
      commentId: comment.id,
      parentCommentId: parentId ?? undefined,
      groupKey: entity.id,
      userId: comment.parent.authorId,
      actionUrl: `/${entityType === 'MARKET' ? 'questions' : 'lists'}/${entity.id}/${entity.slug}#${comment.id}`,
    })
  }

  if (entityType === 'MARKET') {
    await db.market.update({
      where: {
        id: entityId,
      },
      data: {
        commentCount: {
          increment: 1,
        },
        updatedAt: new Date(),
      },
    })
  }

  if (entityType === 'MARKET') {
    // TODO switch this to watchers of the market.
    const recipientIds = await getUniqueLiquidityProviderIds(entity.id, [
      authorId,
      comment.parent?.authorId,
      ...userIdsMentioned,
    ])

    await Promise.all(
      recipientIds.map((recipientId) =>
        createNotification({
          type: 'MARKET_COMMENT',
          actorId: authorId,
          marketId: entity.id,
          commentId: comment.id,
          parentCommentId: parentId ?? undefined,
          groupKey: entity.id,
          userId: recipientId,
          actionUrl: `/questions/${entity.id}/${entity.slug}#${comment.id}`,
        })
      )
    )
  } else if (entityType === 'LIST') {
    const list = await getList({ id: entityId })

    if (![authorId, comment.parent?.authorId, ...userIdsMentioned].includes(list.ownerId)) {
      createNotification({
        type: 'LIST_COMMENT',
        actorId: authorId,
        listId: entity.id,
        commentId: comment.id,
        parentCommentId: parentId ?? undefined,
        groupKey: entity.id,
        userId: list.ownerId,
        actionUrl: `/lists/${entity.id}/${entity.slug}#${comment.id}`,
      })
    }
  }

  return comment
}
