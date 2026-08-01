import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SWRProvider } from '@slimefish/api-helpers/components/SWRProvider'
import { auth } from '@slimefish/auth'
import { SessionProvider } from '@slimefish/auth/components/SessionProvider'
import { EditorExtensions } from '@slimefish/comments/components/EditorExtensions'
import { ReferralProvider } from '@slimefish/referrals/components/ReferralContext'
import { ThemeProvider } from '@slimefish/ui/ThemeProvider'
import '@slimefish/ui/emoji'
import '@slimefish/ui/styles.css'
import { Toaster } from '@slimefish/ui/toaster'
import { TooltipProvider } from '@slimefish/ui/tooltip'
import { UserProvider } from '@slimefish/users/context/UserContext'
import { getUserById } from '@slimefish/users/lib/getUserById'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Slimefish ledger',
  description: 'Prediction market platform',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user = session?.user?.id ? await getUserById({ id: session.user.id }) : null

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
          <SWRProvider>
            <SessionProvider session={session}>
              <UserProvider user={user}>
                <EditorExtensions>
                  <ReferralProvider>
                    <TooltipProvider>{children}</TooltipProvider>
                  </ReferralProvider>
                </EditorExtensions>
              </UserProvider>
            </SessionProvider>
            <Toaster />
          </SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
