import db, { Comment } from '@slimefish/database'
import { sanitizeCommentContent } from './createComment'

export async function updateComment({ id, content }: { id: string; content?: string }) {
  const updatedData: Partial<Comment> = {}

  if (content) {
    const sanitizedContent = sanitizeCommentContent(content)
    if (!sanitizedContent) {
      throw new Error('Comment cannot be empty')
    }
    updatedData.content = sanitizedContent
    updatedData.edited = true
  }

  const updatedComment = await db.comment.update({
    where: { id },
    data: { ...updatedData, updatedAt: new Date() },
  })

  return updatedComment
}
