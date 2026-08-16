/**
 * Voice Interview Coach — Host half.
 *
 * Runs inside the DSH Node.js process. Responsibilities:
 *   - drive LLM calls to generate interview questions and reviews
 *   - parse PDF/DOCX/TEXT resume bytes uploaded from the Client
 *   - persist review + transcript into <workspace>/.interview-memory/
 *   - list and compare previous interviews for trend analysis
 *
 * Communication: package-private JSON RPC via harness.handle(method, fn).
 * Client calls these with host.call(method, args).
 *
 * Note: this file is plain JavaScript (no TS, no bundler, no require of
 * third-party packages that are not guaranteed to be resolvable at runtime).
 * PDF/DOCX parsing uses lightweight, dependency-free heuristics so the
 * plugin works in any DSH deployment without an install step.
 */
return {
  inject: ['llm', 'fs', 'sandboxPolicy'],

  apply(ctx) {
    // In-memory session map. Only one active interview per Package fiber.
    // For a marketplace-grade multi-session version, key by a client-provided
    // sessionId instead.
    const sessions = new Map()

    // ---------- utilities ----------

    function safeJson(text, fallback) {
      if (!text) return fallback
      try { return JSON.parse(text) } catch (_) {
        const m = String(text).match(/\{[\s\S]*\}/)
        if (m) { try { return JSON.parse(m[0]) } catch (__) {} }
        return fallback
      }
    }

    async function askModel(prompt, system) {
      const providers = ctx.llm.listProviders()
      if (!providers.length) throw new Error('当前运行时没有可用的 LLM Provider')
      const provider = providers[0]
      const key = provider.key || provider.name
      const models = await ctx.llm.listModels(key)
      const model = models && models.length ? models[0].id : ''
      const chunks = []
      const stream = ctx.llm.stream({
        provider: key,
        model,
        messages: [
          { role: 'system', content: system || '你是严谨、友好的技术面试官。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.45,
        max_tokens: 3000,
      })
      for await (const chunk of stream) {
        if (chunk.delta) chunks.push(chunk.delta)
        else if (chunk.text) chunks.push(chunk.text)
        else if (chunk.content) chunks.push(chunk.content)
        if (chunk.finish || chunk.error) break
      }
      return chunks.join('').trim()
    }

    function targetContext(p) {
      const types = Array.isArray(p.questionTypes) && p.questionTypes.length
        ? p.questionTypes.join('、')
        : (p.questionTypes || '综合')
      return [
        '目标岗位：' + (p.targetRole || '未填写'),
        '难度/风格/考察重点：' + (p.seniority || '未填写'),
        '题目类型：' + types,
        '编程语言：' + (p.language || '未填写'),
        '项目/经历：' + (p.project || '未填写'),
        '简历/自我介绍：' + String(p.resume || '').slice(0, 16000),
      ].join('\n')
    }

    // ---------- resume parsing (PDF / DOCX / TXT) ----------

    /**
     * Best-effort text extraction for resumes. Accepts either a base64-encoded
     * binary payload ({ filename, mime, base64 }) or a plain text string.
     *
     * PDF: uses a tiny stream parser that extracts text-showing operators
     * (Tj/TJ). Handles most PDFs produced by Word/LaTeX/chromium; scanned PDFs
     * are not OCR-able without a native dependency.
     *
     * DOCX: a .docx is a zip; we decode word/document.xml via the DEFLATE
     * stream without pulling in a zip library. We locate the uncompressed XML
     * inside the zip by scanning local file headers — works because the
     * document.xml entry is typically stored or we can inflate with zlib
     * (built into Node).
     */
    async function parseResume(input) {
      if (typeof input === 'string') return input.slice(0, 20000)
      if (!input || typeof input !== 'object') return ''
      const { filename = '', mime = '', base64 = '' } = input
      if (!base64) return ''

      const lower = filename.toLowerCase()
      const bytes = b64ToBytes(base64)

      try {
        if (lower.endsWith('.pdf') || mime === 'application/pdf') {
          return extractPdfText(bytes).slice(0, 20000)
        }
        if (lower.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          return (await extractDocxText(bytes)).slice(0, 20000)
        }
        if (lower.endsWith('.doc')) {
          return '【检测到旧版 .doc 格式，浏览器/插件端无法可靠解析，请另存为 .docx 或 .pdf 后重试，或直接粘贴简历文本。】'
        }
        // txt/md/json/csv fall through
        return new TextDecoder('utf-8').decode(bytes).slice(0, 20000)
      } catch (e) {
        return '【简历解析失败：' + String(e && e.message || e) + '。建议直接粘贴简历文本。】'
      }
    }

    function b64ToBytes(b64) {
      const bin = atob(b64)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out
    }

    function extractPdfText(bytes) {
      // Find streams and try to inflate them (FlateDecode), then extract
      // text-showing operators. This is intentionally pragmatic, not a full
      // PDF parser — it covers the vast majority of text-based PDFs.
      const zlib = require('zlib')
      const text = []
      const src = new TextDecoder('latin1').decode(bytes)
      const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g
      let m
      while ((m = streamRe.exec(src))) {
        let body = m[1]
        // Try flate decode; ignore failures (raw/uncompressed streams).
        try {
          const inflated = zlib.inflateSync(Buffer.from(body, 'binary'))
          body = inflated.toString('latin1')
        } catch (_) { /* leave body raw */ }
        // Extract ( ... ) Tj  and  [ ... ] TJ
        const tjRe = /\((?:[^()\\]|\\.)*\)\s*Tj/g
        const arrRe = /\[((?:[^\]\\]|\\.)*)\]\s*TJ/g
        let a
        while ((a = tjRe.exec(body))) {
          text.push(decodePdfString(a[0].slice(0, -2).trim()))
        }
        while ((a = arrRe.exec(body))) {
          const parts = a[1].match(/\((?:[^()\\]|\\.)*\)/g) || []
          text.push(parts.map(s => decodePdfString(s.slice(1, -1))).join(''))
        }
      }
      return text.join(' ').replace(/\s+/g, ' ').trim()
    }

    function decodePdfString(s) {
      return s
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
    }

    async function extractDocxText(bytes) {
      const zlib = require('zlib')
      // Locate word/document.xml inside the zip. Scan local file headers.
      const view = bytes
      let offset = 0
      while (offset < view.length - 4) {
        if (view[offset] === 0x50 && view[offset + 1] === 0x4b &&
            view[offset + 2] === 0x03 && view[offset + 3] === 0x04) {
          const method = view[offset + 8] | (view[offset + 9] << 8)
          const compSize = view[offset + 18] | (view[offset + 19] << 8) |
                           (view[offset + 20] << 16) | (view[offset + 21] << 24)
          const nameLen = view[offset + 26] | (view[offset + 27] << 8)
          const extraLen = view[offset + 28] | (view[offset + 29] << 8)
          const nameStart = offset + 30
          const name = new TextDecoder('utf-8').decode(
            view.slice(nameStart, nameStart + nameLen))
          const dataStart = nameStart + nameLen + extraLen
          if (name === 'word/document.xml') {
            let xml
            if (method === 8) {
              xml = zlib.inflateRawSync(
                Buffer.from(view.slice(dataStart, dataStart + compSize))
              ).toString('utf-8')
            } else {
              xml = new TextDecoder('utf-8').decode(
                view.slice(dataStart, dataStart + compSize))
            }
            // Extract text within <w:t>...</w:t>; turn paragraph ends into \n.
            return xml
              .replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => {
                const ts = p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []
                const line = ts.map(t => t.replace(/<[^>]+>/g, ''))
                                .join('').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
                return line + '\n'
              })
              .replace(/<[^>]+>/g, '')
              .trim()
          }
          offset = dataStart + compSize
        } else {
          offset++
        }
      }
      return ''
    }

    // ---------- memory ----------

    async function memoryRoot() {
      const policy = ctx.sandboxPolicy.resolve()
      const root = policy.workspaceRoot || ctx.sandboxPolicy.workspaceRoot
      const clean = String(root).replace(/[\\/]+$/, '')
      const dir = clean + '/.interview-memory'
      try { await ctx.fs.writeText({ path: dir + '/.keep', cwd: root }, '') } catch (_) {}
      return { root: clean, dir }
    }

    async function saveReview(s, review) {
      try {
        const { root, dir } = await memoryRoot()
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const target = dir + '/interview-' + stamp + '.md'
        const transcript = (s.history || []).map(function (x) {
          return '**' + (x.role === 'interviewer' ? '面试官' : '候选人') + '**: ' + x.text
        }).join('\n\n')
        const meta = [
          '---',
          'target_role: ' + (s.profile.targetRole || ''),
          'seniority: ' + (s.profile.seniority || ''),
          'language: ' + (s.profile.language || ''),
          'question_count: ' + s.count,
          'completed: ' + s.index,
          'date: ' + new Date().toISOString(),
          '---',
        ].join('\n')
        const body = meta + '\n\n' + review + '\n\n---\n\n## 对话记录\n\n' + transcript
        await ctx.fs.writeText({ path: target, cwd: root }, body)
        return target
      } catch (e) {
        return '写入失败：' + String(e && e.message || e)
      }
    }

    function parseMarkdownMeta(md) {
      const meta = { target_role: '', seniority: '', language: '', date: '' }
      const m = md.match(/^---\n([\s\S]*?)\n---/)
      if (m) {
        m[1].split('\n').forEach(line => {
          const i = line.indexOf(':')
          if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
        })
      }
      // Pull the overall summary and per-dimension scores as a small snapshot.
      const summary = (md.match(/## 总结\s*\n([\s\S]*?)(\n## |$)/) || [])[1] || ''
      const scoreLines = []
      const scoreRe = /\d+\.\s\*\*([^*]+)\*\*：\s*(\d+(?:\.\d+)?)\/10/g
      let sm
      while ((sm = scoreRe.exec(md))) scoreLines.push({ dimension: sm[1].trim(), score: Number(sm[2]) })
      const gaps = []
      const gapRe = /\*\*知识点\*\*：([^\n]+)\n\s*- 问题：([^\n]*)/g
      let gm
      while ((gm = gapRe.exec(md))) gaps.push({ topic: gm[1].trim(), issue: gm[2].trim() })
      return { meta, summary: summary.trim(), scores: scoreLines, gaps }
    }

    // ---------- RPC methods ----------

    harness.handle('parseResume', async (args) => {
      try {
        const text = await parseResume(args)
        return { ok: true, text }
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) }
      }
    })

    harness.handle('startInterview', async (args) => {
      try {
        const input = args && args.profile ? args.profile : {}
        const p = { ...input }
        if (args && args.resumeFile) {
          p.resume = await parseResume(args.resumeFile)
        }
        const count = Math.max(3, Math.min(15, Number(p.questionCount) || 8))
        const sys =
          '你是资深技术面试官。根据候选人填写的目标岗位、自然语言难度/职级描述和题型偏好决定题目深度：' +
          '初级偏基础，高级/资深偏系统设计、技术权衡、线上故障、性能和影响力。' +
          '第一题自然开场并提出有区分度的问题。只输出 JSON：{"question":"..."}。不要输出 Markdown。'
        const text = await askModel(
          targetContext(p) + '\n计划题目数量：' + count + '\n请给出第一题。', sys)
        const data = safeJson(text, {
          question: '请先做简短自我介绍，并说明你最有代表性的项目、你承担的职责以及最终结果。',
        })
        sessions.set('current', {
          profile: p, count, index: 1,
          history: [{ role: 'interviewer', text: data.question }],
        })
        return { ok: true, question: data.question, index: 1, resumePreview: (p.resume || '').slice(0, 400) }
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) }
      }
    })

    harness.handle('submitAnswer', async (args) => {
      try {
        const s = sessions.get('current')
        if (!s) return { ok: false, error: '面试尚未开始' }
        const answer = String((args && args.answer) || '').trim()
        if (!answer) return { ok: false, error: '回答为空' }
        s.history.push({ role: 'candidate', text: answer })
        const isLast = s.index >= s.count
        const sys = isLast
          ? '你是资深技术面试官兼复盘教练。请根据岗位/难度要求评估最后一轮回答，并输出完整复盘。' +
            '只输出 JSON：{"lastFeedback":"...","scores":[{"dimension":"...","score":1-10,"comment":"..."}],"strengths":["..."],"gaps":[{"topic":"...","issue":"...","studyPlan":"..."}],"suggestedAnswers":["..."],"nextActions":["..."],"summary":"..."}。不要输出 Markdown。'
          : '你是资深技术面试官。请先简要评价上一轮回答，再根据目标岗位、自然语言难度和题型偏好追问或进入下一题。' +
            '问题要结合简历、项目、编程语言和职级，逐步加深。只输出 JSON：{"feedback":"...","question":"..."}。不要输出 Markdown。'
        const transcript = s.history.map((x, i) =>
          (i + 1) + '. ' + (x.role === 'interviewer' ? '面试官' : '候选人') + '：' + x.text
        ).join('\n')
        const prompt = targetContext(s.profile) +
          '\n当前进度：第 ' + s.index + '/' + s.count + ' 题\n对话记录：\n' + transcript +
          '\n\n' + (isLast ? '请输出最后一轮反馈和完整复盘。' : '请输出本轮反馈和下一题。')
        const text = await askModel(prompt, sys)
        if (isLast) {
          const data = safeJson(text, {})
          const review = formatReview(data, s)
          const savedPath = await saveReview(s, review)
          s.completed = true
          return { ok: true, done: true, review, savedPath }
        }
        const data = safeJson(text, {})
        const question = data.question || '请结合一个实际线上问题，说明你是如何定位、权衡并解决它的。'
        const feedback = data.feedback || ''
        s.index += 1
        s.history.push({ role: 'interviewer', text: (feedback ? feedback + '\n\n' : '') + question })
        return { ok: true, question, index: s.index }
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) }
      }
    })

    harness.handle('finishInterview', async () => {
      try {
        const s = sessions.get('current')
        if (!s) return { ok: false, error: '面试尚未开始' }
        const sys =
          '你是面试复盘教练。根据完整对话和岗位/难度生成查缺补漏报告。' +
          '只输出 JSON：{"scores":[{"dimension":"...","score":1-10,"comment":"..."}],"strengths":["..."],"gaps":[{"topic":"...","issue":"...","studyPlan":"..."}],"suggestedAnswers":["..."],"nextActions":["..."],"summary":"..."}。不要输出 Markdown。'
        const transcript = s.history.map((x, i) =>
          (i + 1) + '. ' + (x.role === 'interviewer' ? '面试官' : '候选人') + '：' + x.text
        ).join('\n')
        const text = await askModel(
          targetContext(s.profile) + '\n共进行到第 ' + s.index + ' 题。\n' + transcript, sys)
        const data = safeJson(text, {})
        const review = formatReview(data, s)
        const savedPath = await saveReview(s, review)
        return { ok: true, review, savedPath }
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) }
      }
    })

    harness.handle('saveMemory', async (args) => {
      try {
        const s = sessions.get('current') || {
          profile: (args && args.profile) || {},
          history: (args && args.transcript) || [],
          count: 0, index: 0,
        }
        const review = String((args && args.review) || '')
        const path = await saveReview(s, review)
        return { ok: true, path }
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) }
      }
    })

    harness.handle('listHistory', async () => {
      try {
        const { root, dir } = await memoryRoot()
        const entries = await ctx.fs.listDir({ path: dir, cwd: root })
        const files = (entries || [])
          .filter(e => /\.md$/i.test(e.name))
          .map(e => ({ name: e.name, path: dir + '/' + e.name, mtime: e.mtime || 0 }))
          .sort((a, b) => (a.name < b.name ? 1 : -1))
          .slice(0, 30)
        const summaries = []
        for (const f of files) {
          try {
            const md = await ctx.fs.readText({ path: f.path, cwd: root })
            const parsed = parseMarkdownMeta(md)
            summaries.push({
              name: f.name,
              path: f.path,
              targetRole: parsed.meta.target_role,
              seniority: parsed.meta.seniority,
              language: parsed.meta.language,
              date: parsed.meta.date,
              avgScore: parsed.scores.length
                ? Math.round(parsed.scores.reduce((a, b) => a + b.score, 0) / parsed.scores.length * 10) / 10
                : null,
              topGaps: parsed.gaps.slice(0, 5).map(g => g.topic),
            })
          } catch (_) {}
        }
        return { ok: true, history: summaries }
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) }
      }
    })

    harness.handle('compareHistory', async (args) => {
      try {
        const names = (args && args.names) || []
        if (!names.length) return { ok: false, error: '未选择历史记录' }
        const { root, dir } = await memoryRoot()
        const docs = []
        for (const name of names.slice(0, 10)) {
          try {
            const md = await ctx.fs.readText({ path: dir + '/' + name, cwd: root })
            docs.push({ name, ...parseMarkdownMeta(md) })
          } catch (_) {}
        }
        if (docs.length < 1) return { ok: false, error: '没有可读的历史记录' }
        if (docs.length === 1) {
          return {
            ok: true,
            report: [
              '# 单次面试快照：' + docs[0].name,
              '',
              '- 岗位：' + docs[0].meta.target_role,
              '- 难度：' + docs[0].meta.seniority,
              '- 日期：' + docs[0].meta.date,
              '',
              '## 评分',
              ...docs[0].scores.map(s => '- **' + s.dimension + '**：' + s.score + '/10'),
              '',
              '## 主要短板',
              ...docs[0].gaps.map(g => '- ' + g.topic + '（' + g.issue + '）'),
            ].join('\n'),
          }
        }
        // Multi-interview: ask LLM for a trend analysis grounded in the snapshots.
        const payload = docs.map(d => ({
          name: d.name,
          target: d.meta.target_role,
          seniority: d.meta.seniority,
          date: d.meta.date,
          scores: d.scores,
          gaps: d.gaps,
          summary: d.summary,
        }))
        const sys =
          '你是面试复盘教练。请对比多次模拟面试的评分和短板，给出趋势分析、持续薄弱点和下一步训练计划。使用 Markdown，不要输出 JSON。'
        const text = await askModel(
          '以下是多次面试的结构化快照（JSON）：\n' + JSON.stringify(payload, null, 2), sys)
        return { ok: true, report: text }
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) }
      }
    })

    // ---------- review formatter ----------

    function formatReview(data, s) {
      const scores = Array.isArray(data.scores) ? data.scores : []
      const strengths = Array.isArray(data.strengths) ? data.strengths : []
      const gaps = Array.isArray(data.gaps) ? data.gaps : []
      const suggestedAnswers = Array.isArray(data.suggestedAnswers) ? data.suggestedAnswers : []
      const nextActions = Array.isArray(data.nextActions) ? data.nextActions : []
      const lines = []
      lines.push('# 面试复盘报告')
      lines.push('')
      lines.push('- 目标岗位：' + (s.profile.targetRole || '未填写'))
      lines.push('- 难度/重点：' + (s.profile.seniority || '未填写'))
      lines.push('- 题型：' + (Array.isArray(s.profile.questionTypes) ? s.profile.questionTypes.join('、') : (s.profile.questionTypes || '综合')))
      lines.push('- 编程语言：' + (s.profile.language || '未填写'))
      lines.push('- 完成题数：' + s.index)
      lines.push('')
      lines.push('## 一、综合评分')
      if (!scores.length) lines.push('- 模型未返回结构化评分，建议结合对话人工复核。')
      scores.forEach(function (x, i) {
        lines.push((i + 1) + '. **' + (x.dimension || '维度') + '**：' + (x.score || '-') + '/10 — ' + (x.comment || ''))
      })
      lines.push('')
      lines.push('## 二、表现亮点')
      if (!strengths.length) lines.push('- 暂无结构化亮点。')
      strengths.forEach(function (x, i) { lines.push((i + 1) + '. ' + x) })
      lines.push('')
      lines.push('## 三、查缺补漏')
      if (!gaps.length) lines.push('- 暂无明显短板；可继续提高项目深度与量化表达。')
      gaps.forEach(function (x, i) {
        lines.push((i + 1) + '. **知识点**：' + (x.topic || '待补充'))
        lines.push('   - 问题：' + (x.issue || ''))
        lines.push('   - 补强计划：' + (x.studyPlan || ''))
      })
      lines.push('')
      lines.push('## 四、更优回答建议')
      if (!suggestedAnswers.length) lines.push('- 使用 STAR 法则：背景、任务、行动、结果；补充技术权衡和量化结果。')
      suggestedAnswers.forEach(function (x, i) { lines.push((i + 1) + '. ' + x) })
      lines.push('')
      lines.push('## 五、下一步行动')
      if (!nextActions.length) {
        lines.push('1. 整理 2-3 个核心项目，补充架构、难点、指标和复盘。')
        lines.push('2. 针对目标岗位补齐语言/框架/系统设计高频题。')
        lines.push('3. 再次模拟面试，重点训练表达结构。')
      }
      nextActions.forEach(function (x, i) { lines.push((i + 1) + '. ' + x) })
      lines.push('')
      lines.push('## 总结')
      lines.push(data.summary || '面试复盘完成，请根据短板清单进行针对性补强。')
      return lines.join('\n')
    }
  },
}
