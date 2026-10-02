import esbuild from 'esbuild';

await esbuild.build({
  define: {
    // eslint-disable-next-line dot-notation -- TypeScript requires index access for environment variables.
    __APP_REVISION__: JSON.stringify(process.env['APP_REVISION'] ?? ''),
  },
  entryPoints: ['src/**/*.ts'],
  format: 'esm',
  loader: { '.ts': 'ts' },
  minify: true,
  outbase: 'src',
  outdir: 'dist',
  platform: 'node',
  sourcemap: false,
  target: ['esnext'],
});
