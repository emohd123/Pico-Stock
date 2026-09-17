/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['nodemailer', 'pdf-parse', 'pdfjs-dist', 'jszip', 'pdfkit', 'sharp', 'onnxruntime-node', '@napi-rs/canvas'],
    // pdfjs pulls two things in at runtime that file tracing cannot see: it
    // require()s @napi-rs/canvas to polyfill DOMMatrix, and it imports its own
    // worker module by path. Both were dropped from the lambda, so uploaded
    // quotations failed with "DOMMatrix is not defined" and then "Setting up
    // fake worker failed" — while working locally, where both are on disk.
    outputFileTracingIncludes: {
      '/api/name-art/**': ['./public/name-art/**', './public/fonts/NotoSansArabic-Bold.ttf', './node_modules/@napi-rs/**'],
      '/api/pico-ai/**': ['./private/pico-ai/**', './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**'],
      '/api/quotations/upload/scan': [
        './node_modules/@napi-rs/**',
        './node_modules/pdfjs-dist/legacy/build/**',
      ],
      // The portal reads a quotation's own PDF to recover its contact block when
      // opened for editing, so the same runtime-required files must reach it.
      '/q/[token]': [
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
