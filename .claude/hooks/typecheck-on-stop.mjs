// Stop: TypeScript / Prisma に未コミットの変更があれば型チェックし、失敗したら作業を続けさせる。
// exit 2 で終了をブロックし、stderr のエラー内容を Claude に返す。
import { execSync } from "node:child_process";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
  input = JSON.parse(raw);
} catch {}

// 2回目以降（hook によって作業を続けている最中）は止めない＝無限ループ防止
if (input.stop_hook_active) process.exit(0);

const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const sh = (cmd) => execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let changed = [];
try {
  changed = sh("git status --porcelain --untracked-files=all")
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
} catch {
  process.exit(0);
}

if (!changed.some((f) => /\.(ts|tsx|prisma)$/.test(f))) process.exit(0);

try {
  if (changed.some((f) => f.endsWith(".prisma"))) sh("npx prisma generate");
  sh("npx tsc --noEmit");
} catch (e) {
  const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
  console.error(`型チェック（npx tsc --noEmit）が失敗しています。原因を直してから完了してください。\n${out}`);
  process.exit(2);
}

process.exit(0);
