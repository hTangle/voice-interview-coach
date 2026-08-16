# 语音面试复盘助手 🎙️

> 一个 **DSH（DeepSeek Harness）** 插件：根据项目、编程语言、简历、目标岗位和自然语言难度，进行语音模拟面试，并在结束后输出查缺补漏报告，支持 Markdown 导出、记忆写入和多次面试历史对比。

---

## 功能特性

- 🗣️ **语音面试**：浏览器 Web Speech API 识别回答 + 语音合成朗读问题，同时提供文字兜底。
- 🎯 **自然语言难度**：目标岗位 / 职级 / 风格全部用自然语言描述（例如 "高级后端，偏 P7，重点高并发和系统设计"），模型自动调整深度。
- 🧩 **题型多选**：项目深挖、系统设计、编程语言基础、八股/原理、行为面试、线上故障/调试、算法/编码、工程实践。
- 📄 **简历上传**：原生支持 txt/md/json/csv；**PDF / DOCX** 在 Host 端通过内置的轻量解析器读取（无第三方原生依赖）。
- 📝 **结构化复盘**：分维度评分、亮点、短板（含补强计划）、更优回答建议、下一步行动。
- 💾 **写入记忆**：每份复盘连同对话记录写入 `<workspace>/.interview-memory/interview-<timestamp>.md`，后续会话可直接读取。
- 📈 **历史对比**：勾选多次面试，由模型生成趋势分析和持续薄弱点。
- ⬇️ **一键导出 Markdown**。

## 运行环境

- DSH `>= 0.1.0-rc.6`（Cordis 动态插件运行时）
- 已配置至少一个 `llm` Provider
- 语音识别需要 Chromium 内核浏览器（Chrome / Edge / Arc），其他浏览器可使用文字模式

## 安装

### 从 DSH 插件市场

在 DSH 设置 → Plugins 中搜索 "Voice Interview Coach" 安装即可。

### 从 GitHub 源码安装

```bash
git clone https://github.com/<your-org>/dsh-voice-interview-coach.git
```

在你的 Cordis composition（host 或 agent preset 的 `cordis.yml`）里加入一行：

```yaml
- id: voice-interview-coach
  apply: ./dsh-voice-interview-coach
```

插件代码是纯 JavaScript，只有 Node 内置的 `zlib`，**不需要 npm install**。

## 使用方法

1. 在加载了插件的会话中打开插件卡片。
2. 填写：
   - **目标岗位 / 难度**（自然语言）
   - **面试风格 / 考察重点**（可选）
   - **题型**（多选）
   - **项目经历、编程语言、简历**（粘贴或上传）
   - **题目数量**（3–15）
3. 点击 **开始语音面试**，面试官会朗读第一题。
4. 每题后点击 **🎙 语音回答**（或在文本框输入后按 Enter）。
5. 完成题数或点击 **结束并复盘** 后，查看报告。
6. 可 **导出 Markdown**、**写入记忆**，或切换到 **历史对比** 选择多次面试生成趋势分析。

## 工作原理

```
┌─────────────── 浏览器（Client）───────────────┐      ┌──────────── Host（Node）────────────┐
│  注册在 tool.view.cordis 槽位的 React UI     │      │  harness.handle():                  │
│  • SpeechRecognition / SpeechSynthesis       │ RPC  │   • startInterview / submitAnswer   │
│  • 简历文件读取（PDF/DOCX 转 base64） ────────┼─────►│   • parseResume（内置 PDF/DOCX 解析）│
│  • Markdown 下载、历史选择                   │      │   • listHistory / compareHistory    │
│                                              │      │   • saveMemory → 工作区/.interview-memory/ │
└──────────────────────────────────────────────┘      │  ctx.llm.stream(...) 出题/复盘       │
                                                      └─────────────────────────────────────┘
```

所有副作用都绑定到插件 Fiber，停止/卸载会自动清理。

## 配置项

| 配置 | 位置 | 默认值 | 说明 |
|------|------|--------|------|
| 记忆目录 | Host | `<workspace>/.interview-memory/` | 复盘 Markdown 存放位置 |
| 简历大小上限 | Client | 上传 5MB，解析后 20000 字符 | 超出会截断后再发给模型 |
| LLM Provider | Host | `ctx.llm.listProviders()[0]` | 在 DSH 部署中配置默认 Provider |
| 语音语言 | Client | `zh-CN` | 可在 `src/client.js` 中修改 |

## 开发

```bash
# 校验 package.json 元信息
npm run lint:meta

# 预览 npm 打包内容
npm run pack
```

本地快速迭代：直接修改 `src/host.js` / `src/client.js`，重新加载插件行；或把函数体贴进 `cordis_define` 即时测试。

## Roadmap

- [ ] 可选接入云端 ASR（火山 / Whisper），提升中文识别稳定性
- [ ] 支持岗位 JD（文本 / URL）对齐题目
- [ ] 支持并发多场面试（当前每个 Fiber 一场）
- [ ] 按周/月的能力变化曲线
- [ ] 英文界面

## 隐私

简历和对话会发送到当前 DSH 配置的 `llm` Provider，并以 Markdown 文件形式写入工作区 `.interview-memory/`。在涉及敏感个人信息时，请确认你信任模型供应商和工作区存储。

## License

MIT © 2025
