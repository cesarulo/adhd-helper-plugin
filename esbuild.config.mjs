import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2022",
  platform: "browser",
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
