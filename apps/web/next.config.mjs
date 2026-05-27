import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientStudioSrc = path.join(__dirname, '../client/src');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development practices
  reactStrictMode: true,

  // Allow importing the Vite-era studio source tree from `apps/client/src` via `@studio/*`.
  experimental: {
    externalDir: true,
  },

  // Production optimizations
  poweredByHeader: false,  // Remove X-Powered-By header for security
  compress: true,          // Enable gzip compression

  // Image optimization (barcode SVGs may also use <img> to avoid host coupling)
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: (() => {
      const patterns = [
        {
          protocol: 'http',
          hostname: 'localhost',
          port: '8000',
          pathname: '/api/**',
        },
        {
          protocol: 'http',
          hostname: '127.0.0.1',
          port: '8000',
          pathname: '/api/**',
        },
      ];
      const base = process.env.NEXT_PUBLIC_API_BASE_URL;
      if (base) {
        try {
          const u = new URL(base);
          if (
            u.hostname &&
            u.hostname !== 'localhost' &&
            u.hostname !== '127.0.0.1'
          ) {
            const entry = {
              protocol: u.protocol === 'https:' ? 'https' : 'http',
              hostname: u.hostname,
              pathname: '/api/**',
            };
            if (u.port) {
              entry.port = u.port;
            }
            patterns.push(entry);
          }
        } catch {
          /* ignore invalid URL */
        }
      }
      return patterns;
    })(),
  },

  // Remove console logs in production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],  // Keep error and warn logs
    } : false,
  },

  // Environment variables that should be available at build time
  env: {
    NEXT_PUBLIC_APP_NAME: 'Quake Inventory',
    NEXT_PUBLIC_APP_VERSION: '1.0.0',
  },

  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@studio': clientStudioSrc,
    };

    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/i,
      type: 'asset/source',
    });

    return config;
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
