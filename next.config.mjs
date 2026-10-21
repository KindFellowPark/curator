/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // TMDB poster artwork is served from this host.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'image.tmdb.org' }],
  },
};

export default nextConfig;
