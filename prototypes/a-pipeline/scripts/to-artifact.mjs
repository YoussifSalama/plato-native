// The artifact host wraps the page in its own <html>/<head>/<body>, so the build
// is turned into a fragment: title, meta, font link, styles, the root and the script.
import { readFileSync, writeFileSync } from "node:fs"
const html = readFileSync("dist/index.html", "utf8")
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]).join("\n")
const title = pick(/<title>[\s\S]*?<\/title>/g)
const fonts = pick(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g)
const styles = pick(/<style[\s\S]*?<\/style>/g)
const scripts = pick(/<script[\s\S]*?<\/script>/g)
const out = [title, '<meta name="claude:viewport-fit-sides" content="cover">', fonts, styles, '<div id="root"></div>', scripts].join("\n")
writeFileSync("dist/plato-pipeline.html", out)
console.log("artifact fragment:", (out.length / 1024).toFixed(0), "KB")
