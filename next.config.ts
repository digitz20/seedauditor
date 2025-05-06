import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      // Add other potential image sources if needed in the future
      // Example: for cryptocurrency icons
      // {
      //   protocol: 'https',
      //   hostname: 'cryptologos.cc',
      //   port: '',
      //   pathname: '/logos/**',
      // },
    ],
  },
};

export default nextConfig;
