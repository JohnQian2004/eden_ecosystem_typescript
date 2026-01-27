const esbuild = require('esbuild');
const { glob } = require('glob');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch');

// Find all TypeScript files (excluding node_modules and dist)
async function getEntryPoints() {
  const files = await glob('**/*.ts', {
    ignore: ['node_modules/**', 'dist/**', '**/*.d.ts']
  });
  return files;
}

async function build() {
  const entryPoints = await getEntryPoints();
  
  const buildOptions = {
    entryPoints,
    bundle: false, // Don't bundle, just transpile (like tsc)
    outdir: './dist',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    minify: isProduction,
    tsconfig: './tsconfig.json',
    logLevel: 'info',
    // Preserve directory structure
    outbase: './'
    // Note: external option only works with bundle: true.
    // When bundle: false, esbuild just transpiles and doesn't resolve/bundle dependencies.
  };

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('👀 Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('✅ Build complete!');
  }
}

build().catch((error) => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});

