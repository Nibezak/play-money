import { revalidateTag } from 'next/cache'
import { getExtendedList } from '@slimefish/api-helpers/client'
import { ListComments } from '@slimefish/lists/components/ListComments'
import { ListPage } from '@slimefish/lists/components/ListPage'

export default async function AppListsSlugPage({ params }: { params: { listId: string } }) {
  const { data: list } = await getExtendedList({ listId: params.listId })

  // eslint-disable-next-line @typescript-eslint/require-await -- Next requires this to be async since its SSR
  const handleRevalidate = async () => {
    'use server'
    revalidateTag(`list:${params.listId}`)
  }

  return <ListPage list={list} onRevalidate={handleRevalidate} renderComments={<ListComments listId={list.id} />} />
}
