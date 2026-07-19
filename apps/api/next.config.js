/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Lint is enforced as a separate CI task; keeping it out of Next's build
  // prevents legacy lint debt from blocking production artifact validation.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      {
        source: '/v1/:path*',
        destination: `/api/v1/:path*`,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/v1/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000',
          }, // Origin needs to be explicit when using {credentials: true}
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
          },
        ],
      },
    ]
  },
}
