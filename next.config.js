/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['nodemailer', 'pdf-parse', 'pdfjs-dist', 'jszip', 'pdfkit', 'sharp', 'onnxruntime-node', '@napi-rs/canvas'],
    // These furniture photos/GLBs are served by the CDN. Dynamic image/attachment
    // resolvers otherwise copy the whole new library into unrelated email lambdas.
    outputFileTracingExcludes: {
      '/*': [
        './public/event-studio/**/*',
        // Browser-only company/heritage artwork is also pulled in by generic
        // quotation image resolvers. Product photos, branding and fonts stay bundled.
        './public/company/**/*',
        './public/company-profile/**/*',
        './public/landmark-stories/**/*',
        './private/event-studio/rbc/!(site-seed.json|furniture-assets.json)',
        './private/event-studio/rbc/*/**',
      ],
      '/api/!(pico-ai)/**': ['./private/event-studio/**/*'],
      '/api/pico-ai/admin/event-layouts/**': [
        './private/pico-ai/**/*',
        './node_modules/onnxruntime-node/**/*',
      ],
    },
    // pdfjs pulls two things in at runtime that file tracing cannot see: it
    // require()s @napi-rs/canvas to polyfill DOMMatrix, and it imports its own
    // worker module by path. Both were dropped from the lambda, so uploaded
    // quotations failed with "DOMMatrix is not defined" and then "Setting up
    // fake worker failed" — while working locally, where both are on disk.
    outputFileTracingIncludes: {
      '/api/name-art/**': ['./public/name-art/**', './public/fonts/NotoSansArabic-Bold.ttf', './node_modules/@napi-rs/**'],
      '/api/pico-ai/**': ['./private/pico-ai/**', './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**'],
      '/api/pico-ai/admin/event-layouts/**': ['./private/event-studio/rbc/site-seed.json', './private/event-studio/rbc/furniture-assets.json'],
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
