/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['nodemailer', 'pdf-parse', 'pdfjs-dist', 'jszip', 'pdfkit', 'sharp'],
    // pdfjs loads @napi-rs/canvas with a runtime require to polyfill DOMMatrix.
    // File tracing cannot see that, so the native package was dropped from the
    // lambda and every uploaded quotation failed with "DOMMatrix is not
    // defined" — while working locally, where the package is present.
    outputFileTracingIncludes: {
      '/api/quotations/upload/scan': ['./node_modules/@napi-rs/**'],
    },
  },
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
};

module.exports = nextConfig;
