import type { BunPlugin } from "bun";

// Ink statically imports react-devtools-core behind a DEV flag; the compiled
// binary must not depend on it.
const stubDevtools: BunPlugin = {
  name: "stub-react-devtools-core",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "react-devtools-core",
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export default { initialize() {}, connectToDevTools() {} };",
      loader: "js",
    }));
  },
};

const entry = process.argv[2] ?? "src/cli.tsx";
const outfile = process.argv[3] ?? "dist/ym";
const target = process.argv[4] as Bun.Build.CompileTarget | undefined;
// Only release builds carry a version; "dev" builds never update themselves.
const version = process.env.YM_VERSION || "dev";

const result = await Bun.build({
  entrypoints: [entry],
  compile: { outfile, ...(target ? { target } : {}) },
  plugins: [stubDevtools],
  define: { "process.env.YM_VERSION": JSON.stringify(version) },
  minify: true,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`built ${outfile} (${version}${target ? `, ${target}` : ""})`);
