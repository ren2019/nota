import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

if (process.platform !== "darwin") throw new Error("This deployment command is for the Mac mini.");
const root = fileURLToPath(new URL("../", import.meta.url));
const app = path.join(root, "app");
const vite = path.join(app, "node_modules/vite/bin/vite.js");
const label = "ink.nota.web";
const domain = `gui/${process.getuid()}`;
const service = `${domain}/${label}`;
const plist = path.join(homedir(), "Library/LaunchAgents", `${label}.plist`);
const runtime = path.join(root, "local/runtime");
const xml = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
if (existsSync(plist) && !readFileSync(plist, "utf8").includes(xml(root))) throw new Error("An unrelated Nota service already exists; leaving it untouched.");
execFileSync(process.execPath, [path.join(app, "node_modules/typescript/bin/tsc")], { cwd: app, stdio: "inherit" });
execFileSync(process.execPath, [vite, "build"], { cwd: app, stdio: "inherit" });
mkdirSync(path.dirname(plist), { recursive: true });
mkdirSync(runtime, { recursive: true });
const localName = execFileSync("/usr/sbin/scutil", ["--get", "LocalHostName"], { encoding: "utf8" }).trim();
const args = [process.execPath, vite, "preview", "--host", "0.0.0.0", "--port", "5173", "--strictPort"];
writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map((v) => `<string>${xml(v)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(app)}</string>
<key>EnvironmentVariables</key><dict>
<key>PATH</key><string>${xml(path.dirname(process.execPath))}:/usr/bin:/bin:/usr/sbin:/sbin</string>
<key>NOTA_ALLOWED_HOSTS</key><string>${xml(localName)}.local</string>
</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(path.join(runtime, "nota.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(runtime, "nota-error.log"))}</string>
</dict></plist>
`, { mode: 0o600 });
const status = execFileSync("/bin/launchctl", ["list"], { encoding: "utf8" });
if (status.split("\n").some((line) => line.endsWith(`\t${label}`))) {
  execFileSync("/bin/launchctl", ["bootout", service]);
  await delay(500);
}
// launchd can still be releasing a previous service after bootout returns.
for (let attempt = 0; ; attempt++) {
  try { execFileSync("/bin/launchctl", ["bootstrap", domain, plist], { stdio: "pipe" }); break; }
  catch (error) { if (attempt >= 4) throw error; await delay(300 * (attempt + 1)); }
}
for (let attempt = 0; ; attempt++) {
  try {
    const page = await fetch("http://127.0.0.1:5173/", { signal: AbortSignal.timeout(1000) });
    const library = await fetch("http://127.0.0.1:5173/api/library", { signal: AbortSignal.timeout(1000) });
    if (!page.ok || !(await page.text()).includes("<title>Nota") || !library.ok || !Array.isArray(await library.json())) throw new Error("Nota is not ready yet.");
    break;
  } catch (error) { if (attempt >= 19) throw error; await delay(250); }
}
console.log(`Nota service installed: ${service}`);
console.log(`Library: ${path.join(root, "local/library")}`);
for (const addresses of Object.values(networkInterfaces())) for (const a of addresses ?? []) {
  if (a.family === "IPv4" && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) console.log(`http://${a.address}:5173/?lang=zh`);
}
console.log(`http://${localName}.local:5173/?lang=zh`);
