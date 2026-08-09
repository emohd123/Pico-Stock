/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['nodemailer', 'pdf-parse', 'pdfjs-dist', 'jszip', 'pdfkit', 'sharp'],
    // pdfjs pulls two things in at runtime that file tracing cannot see: it
    // require()s @napi-rs/canvas to polyfill DOMMatrix, and it imports its own
    // worker module by path. Both were dropped from the lambda, so uploaded
    // quotations failed with "DOMMatrix is not defined" and then "Setting up
    // fake worker failed" — while working locally, where both are on disk.
    outputFileTracingIncludes: {
      '/api/quotations/upload/scan': [
        './node_modules/@napi-rs/**',
        './node_modules/pdfjs-dist/legacy/build/**',
      ],
    },
  },
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
};

module.exports = nextConfig;
