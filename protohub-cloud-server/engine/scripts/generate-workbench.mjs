#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const titleArg = process.argv.find(a => a.startsWith("--title="))?.replace("--title=", "") || "产品原型 PRD";

const templatePath = path.resolve(__dirname, "../assets/workbench/prd-workbench-template.html");
if (!fs.existsSync(templatePath)) {
  console.error(`未找到工作台模板文件：${templatePath}`);
  process.exit(1);
}

const template = fs.readFileSync(templatePath, "utf8");

// 自动扫描目标目录下所有 .html 页面（排除 index.html 和 chanpin_wendang.html）
const allFiles = fs.readdirSync(targetDir);
const pageFiles = allFiles.filter(f => f.endsWith(".html") && f !== "index.html" && f !== "chanpin_wendang.html");

const pages = pageFiles.map(file => {
  const content = fs.readFileSync(path.join(targetDir, file), "utf8");
  const match = content.match(/<title>([^<]+)<\/title>/i);
  let name = file.replace(".html", "");
  if (match && match[1]) {
    name = match[1].split(/[-_·|]/)[0].trim() || name;
  }
  return {
    id: file.replace(".html", "").replace(/[^a-zA-Z0-9_-]/g, "_"),
    name,
    path: file,
    visible: true
  };
});

const storageKey = `PRD_PAGES_REGISTRY_${path.basename(targetDir)}`;

const outputHtml = template
  .replace(/__HUB_TITLE__/g, titleArg)
  .replace(/__STORAGE_KEY__/g, storageKey)
  .replace(/__DEFAULT_PAGES_JSON__/g, JSON.stringify(pages, null, 2));

const outIndex = path.join(targetDir, "index.html");
const outWorkbench = path.join(targetDir, "chanpin_wendang.html");

fs.writeFileSync(outIndex, outputHtml, "utf8");
fs.writeFileSync(outWorkbench, outputHtml, "utf8");

console.log(`✅ 成功为 [${targetDir}] 生成统一 PRD 工作台！`);
console.log(`- 入口文件：${outIndex}`);
console.log(`- 备用文件：${outWorkbench}`);
console.log(`- 已扫描并接入 ${pages.length} 个页面：${pages.map(p => p.name).join(", ")}`);
