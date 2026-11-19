// PreToolUse（Edit / Write）: .env の書き換えと、コミット済みマイグレーションの編集をブロックする。
// exit 2 で操作を止め、stderr の理由を Claude に返す。
import { execFileSync } from "node:child_process";
import path from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const filePath = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (!filePath) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const abs = path.resolve(projectDir, filePath);
const rel = path.relative(projectDir, abs).split(path.sep).join("/");
const base = path.basename(abs);

if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") {
  console.error(`${rel} は秘密情報のファイルなので編集できません。必要な値はオーナーに設定を依頼してください（.env.example への追記は可）。`);
  process.exit(2);
}

if (rel.startsWith("prisma/migrations/")) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", rel], { cwd: projectDir, stdio: "ignore" });
    console.error(`${rel} はコミット済みのマイグレーションです。編集せず、npx prisma migrate dev --name <内容> で新しいマイグレーションを作ってください。`);
    process.exit(2);
  } catch {
    // 未コミット（作成中）のマイグレーションは編集可
  }
}

process.exit(0);
