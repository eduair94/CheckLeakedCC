import { defineConfig } from 'tsup';

export default defineConfig([
  // Library: dual ESM + CJS with type declarations.
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    target: 'node20',
    outDir: 'dist',
  },
  // CLI / MCP server binary (`npx checkleakedcc mcp`). The shebang in src/cli.ts is preserved.
  {
    entry: { cli: 'src/cli.ts' },
    format: ['cjs'],
    dts: false,
    sourcemap: false,
    clean: false,
    treeshake: true,
    target: 'node20',
    outDir: 'dist',
    platform: 'node',
  },
]);
