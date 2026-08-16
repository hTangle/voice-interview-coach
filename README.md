# Voice Interview Coach 🎙️

> A **DSH (DeepSeek Harness)** plugin that turns the chat into a voice-driven mock interview. Give it your project, language, resume, and target role in natural language; it asks progressively harder questions, listens to your spoken answers, and finishes with a gap-analysis review you can export to Markdown and persist to memory.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)

---

## Features

- 🗣️ **Voice interview** — uses the browser's [Web Speech API](https://developer.mozilla.org/docs/Web/API/Web_Speech_API) for both speech recognition and text-to-speech. A text fallback is always available.
- 🎯 **Natural-language difficulty** — describe the target role and seniority any way you like (e.g. "高级后端开发工程师，要求高并发和系统设计，偏 P7"). The model adjusts question depth automatically.
- 🧩 **Question type chips** — pick any mix of 项目深挖 / 系统设计 / 编程语言基础 / 八股原理 / 行为面试 / 线上故障 / 算法编码 / 工程实践.
- 📄 **Resume upload** — supports `.txt`, `.md`, `.json`, `.csv` natively, plus **PDF and DOCX** parsed in the Host with no native dependencies (a tiny built-in FlateDecode / zip-XML reader).
- 📝 **Structured review** — scores per dimension, strengths, gaps with study plans, better-answer suggestions, and a prioritized action list.
- 💾 **Memory** — every review (with transcript) is written to `.interview-memory/interview-<timestamp>.md` inside the current workspace so future sessions can read it.
- 📈 **History & trend analysis** — list past interviews, select any subset, and ask the model to produce a trend report highlighting recurring weak spots.
- ⬇️ **One-click Markdown export**.

## Requirements

- DSH `>= 0.1.0-rc.6` (Cordis dynamic-plugin runtime)
- A configured `llm` Provider in your DSH deployment
- A Chromium-based browser (Chrome / Edge / Arc) for speech recognition; Firefox/Safari can still use text mode

## Installation

### From a DSH plugin marketplace

Once the package is published, install it from the Plugins settings page in DSH.

### From this repository

```bash
# 1. clone or download this repo into your DSH plugin path
git clone https://github.com/<your-org>/dsh-voice-interview-coach.git

# 2. add a row to your agent preset or host composition (cordis.yml):
#    - id: voice-interview-coach
#      apply: ./dsh-voice-interview-coach
```

Because the plugin is plain JavaScript with zero npm dependencies, there is no `npm install` step. The Host requires Node's built-in `zlib` (already available).

## Usage

1. Open the DSH session where the plugin is loaded. Run the `cordis_define` / `cordis_run` card (or the plugin's own entry point).
2. Fill in:
   - **Target role / difficulty** — natural language
   - **Focus / style** — what the interviewer should probe (optional)
   - **Question types** — chip multi-select
   - **Project**, **programming language**, **resume** (paste or upload)
   - **Question count** (3–15)
3. Click **开始语音面试**. The interviewer speaks the first question.
4. Click **🎙 语音回答** (or type in the textarea and press Enter) after each question.
5. When the count is reached — or you click **结束并复盘** — the review appears.
6. Use **⬇ 导出 Markdown** to download it, **💾 写入记忆** to re-save it, and switch to the **历史对比** tab to compare multiple interviews.

## How it works

```
┌─────────────── Browser (Client) ───────────────┐      ┌──────────── Host (Node) ────────────┐
│  React UI in `tool.view.cordis` slot           │      │  harness.handle():                  │
│  • SpeechRecognition / SpeechSynthesis         │ RPC  │   • startInterview / submitAnswer   │
│  • File upload (base64 for PDF/DOCX)  ─────────┼─────►│   • parseResume (PDF/DOCX via zlib) │
│  • Markdown download, history selection        │      │   • listHistory / compareHistory    │
│                                                │      │   • saveMemory → <workspace>/.interview-memory/ │
└────────────────────────────────────────────────┘      │  ctx.llm.stream(...) for Q&A/review │
                                                        └─────────────────────────────────────┘
```

The plugin follows the standard Cordis lifecycle — every side effect is tied to the plugin fiber, so stopping/uninstalling removes all listeners and UI registrations cleanly.

## Configuration

| Field | Where | Default | Description |
|-------|-------|---------|-------------|
| Memory directory | Host | `<workspace>/.interview-memory/` | Where review Markdown files are stored |
| Resume size limit | Client | 5 MB upload, 20 000 chars after parsing | Larger resumes are truncated before being sent to the model |
| LLM provider | Host | first registered provider | Selected via `ctx.llm.listProviders()[0]`; change in code or configure your deployment's default |
| Speech language | Client | `zh-CN` | Change `rec.lang` / `SpeechSynthesisUtterance.lang` in `src/client.js` |

## Development

```bash
# Verify package metadata
npm run lint:meta

# Dry-run the npm tarball
npm run pack
```

To iterate inside a live DSH session, edit `src/host.js` / `src/client.js` and either:

- reload the plugin row in your DSH composition, or
- copy the function bodies into a `cordis_define` call to test instantly.

### Project layout

```
.
├── package.json           # plugin manifest (the `dsh` block is the DSH entry)
├── src/
│   ├── host.js            # Node half: LLM, PDF/DOCX parsing, memory, history
│   └── client.js          # Browser half: React UI, speech I/O, file upload
├── assets/icon.svg        # plugin icon
├── scripts/verify-package.js
├── docs/                  # longer design notes
├── README.md
└── LICENSE
```

## Roadmap

- [ ] Optional cloud ASR (Volcengine/Whisper) for better Chinese recognition
- [ ] JD/URL ingestion for job description alignment
- [ ] Multi-session concurrent interviews (currently one per fiber)
- [ ] Per-skill review trends across weeks/months
- [ ] English UI

## Privacy

Resumes and interview transcripts are sent to whichever `llm` provider your DSH deployment is configured to use. They are also stored as plain Markdown under `.interview-memory/` inside the workspace. Do not use this plugin with sensitive personal data unless you trust both the model provider and the workspace storage.

## License

MIT © 2025
