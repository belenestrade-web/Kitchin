/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // El plano de cocina puede pesar hasta 20MB (spec Pantalla 3).
    serverActions: { bodySizeLimit: '21mb' },
  },
};

export default nextConfig;
