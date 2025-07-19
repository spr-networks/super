/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/plugins/dyndns',
  assetPrefix: '/admin/custom_plugin/dyndns/static',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig