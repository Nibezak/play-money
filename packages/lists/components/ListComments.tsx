import { revalidateTag } from 'next/cache'
import React from 'react'
import { getListComments } from '@slimefish/api-helpers/client'
import { CommentsList } from '@slimefish/comments/components/CommentsList'

export async function ListComments({ listId }: { listId: string }) {
  const { data: comments } = await getListComments({ listId })

  const handleRevalidate = async () => {
    'use server'
    revalidateTag(`list:${listId}:comments`)
  }

  return <CommentsList comments={comments} entity={{ type: 'LIST', id: listId }} onRevalidate={handleRevalidate} />
}
