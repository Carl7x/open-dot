# open-dot

用 TypeScript 调用 [dots.ai](https://dots.ai/chat/home/new) 的本地命令行工具，把常用操作收敛成 `open-dot ask`。它访问的是 **dots.ai** 网页。

## 安装与登录

需要 Node.js 20+ 和本机 Chrome。在项目目录执行：

```powershell
npm install
npm run build
npm link
open-dot login
```

`login` 会打开独立的 Chrome 窗口，请在其中自行登录 dots.ai。登录资料保存在项目目录的 `.browser_data/`，已经加入 `.gitignore`；不要将这个目录、Cookie 或令牌上传到 GitHub。

## Ask

```powershell
open-dot ask "上海周末露营有哪些建议？" --new --json
```

`--new` 开新对话；省略时继续当前浏览器对话。`--json` 输出 `{content, images, sources}`。`sources` 只包含网页回答中实际渲染出来的小红书链接，无法保证覆盖点点使用的全部笔记。

不想使用 `npm link` 时，可以运行 `npm run ask -- "问题" --new --json`。

## 可选：本地 OpenAI 格式 API

```powershell
npm start
```

默认监听 `127.0.0.1:8000`，提供 `POST /v1/chat/completions`、`GET /v1/models` 和 `GET /health`。请求示例：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/v1/chat/completions `
  -ContentType 'application/json' `
  -Body '{"model":"dots-ai","user":"new","messages":[{"role":"user","content":"你好"}]}'
```

可设置 `PORT`、`HOST`、`HEADLESS=0`、`DOTS_TIMEOUT_MS` 环境变量。`stream: true` 会在回答完成后用 SSE 发出内容，并不实时逐字输出。`usage` 为零，因为网页没有提供可靠的 token 用量。服务串行处理请求，避免同时操作同一个浏览器对话；它不提供多用户会话隔离。

## 限制

此工具依赖 dots.ai 当前网页结构，页面更新后可能需要调整选择器。完整端到端调用须在已登录的账号上验证。请遵守 dots.ai 和相关平台的使用规则。
