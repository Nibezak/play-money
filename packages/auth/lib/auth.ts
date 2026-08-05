import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import db from '@slimefish/database'
import { updateUserById } from '@slimefish/users/lib/updateUserById'
import { PrismaAdapter } from './auth-prisma-adapter'

const nextAuthUrl = process.env.NEXTAUTH_URL || (process.env.NODE_ENV === 'production' ? 'https://api.slimefish.com' : 'http://localhost:3000')
const resendEmail = process.env.AUTH_RESEND_EMAIL || 'noreply@slimefish.com'

const useSecureCookies = nextAuthUrl.startsWith('https://')
const cookiePrefix = useSecureCookies ? '__Secure-' : ''
let hostName = 'slimefish.com'
try {
  hostName = new URL(nextAuthUrl).hostname
}
catch {}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  pages: {
    signIn: '/login',
    error: '/login',
    verifyRequest: '/check-email',
    newUser: '/setup',
  },
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Support cookies on different subdomains
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        domain: `.${hostName}`,
        secure: useSecureCookies,
      },
    },
  },

  providers: [
    Resend({
      from: process.env.AUTH_RESEND_EMAIL,
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      // This actually runs on the server so the timezone is not actually the users.
      // TODO: Move this to the user account setup on create account when created.
      // if (user?.id) {
      //   const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      //   if (Intl.supportedValuesOf('timeZone').includes(timezone)) {
      //     await updateUserById({ id: user.id, timezone })
      //   }
      // }
      return true
    },
  },
})
