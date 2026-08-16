/**
 * Voice Interview Coach — Client half.
 *
 * Runs in the DSH browser page as a React UI mounted into the
 * `tool.view.cordis` slot. Responsibilities:
 *   - collect candidate profile (project, language, target role, seniority,
 *     question types, resume)
 *   - capture answers via Web Speech API (SpeechRecognition + SpeechSynthesis)
 *     or a text fallback
 *   - upload resume files and let the Host parse PDF/DOCX/TXT
 *   - render transcript and Markdown review
 *   - export review to a .md file, write it into the workspace memory dir,
 *     list previous interviews and compare them
 *
 * Plain JavaScript (no JSX, no bundler, no TS). React is provided by DSH.
 */
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (!slots) return

    const disposeStyle = styles.insert(`
      .vint-card { font: 14px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; padding: 14px; display:flex; flex-direction:column; gap:12px; }
      .vint-title { font-weight:700; font-size:16px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .vint-badge { font-size:11px; padding:2px 8px; border-radius:999px; background:rgba(59,130,246,.14); color:#2563eb; font-weight:600; }
      .vint-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .vint-field { display:flex; flex-direction:column; gap:4px; }
      .vint-field.full { grid-column:1/-1; }
      .vint-label { font-size:12px; opacity:.72; font-weight:600; }
      .vint-input,.vint-textarea,.vint-select { width:100%; box-sizing:border-box; border:1px solid rgba(120,120,130,.28); border-radius:9px; padding:8px 10px; outline:none; background:rgba(255,255,255,.65); color:inherit; }
      .vint-textarea { min-height:74px; resize:vertical; }
      .vint-chips { display:flex; flex-wrap:wrap; gap:6px; }
      .vint-chip { border:1px solid rgba(120,120,130,.3); background:rgba(255,255,255,.5); border-radius:999px; padding:4px 10px; font-size:12px; cursor:pointer; user-select:none; }
      .vint-chip.on { background:#2563eb; border-color:#2563eb; color:white; }
      .vint-file { border:1px dashed rgba(120,120,130,.4); border-radius:9px; padding:8px; display:flex; align-items:center; gap:8px; cursor:pointer; }
      .vint-file input { display:none; }
      .vint-actions { display:flex; flex-wrap:wrap; gap:8px; }
      .vint-btn { border:0; border-radius:999px; padding:8px 13px; cursor:pointer; font-weight:700; background:#2563eb; color:white; }
      .vint-btn.secondary { background:rgba(120,120,130,.16); color:inherit; }
      .vint-btn.danger { background:#dc2626; }
      .vint-btn:disabled { opacity:.55; cursor:not-allowed; }
      .vint-status { font-size:12px; opacity:.80; padding:7px 10px; border-radius:8px; background:rgba(120,120,130,.10); white-space:pre-wrap; }
      .vint-transcript { max-height:280px; overflow:auto; border:1px solid rgba(120,120,130,.18); border-radius:10px; }
      .vint-msg { padding:9px 10px; border-bottom:1px solid rgba(120,120,130,.12); }
      .vint-msg:last-child { border-bottom:0; }
      .vint-role { font-size:11px; font-weight:800; text-transform:uppercase; opacity:.62; margin-bottom:3px; }
      .vint-msg.interviewer .vint-role { color:#2563eb; opacity:1; }
      .vint-msg.you .vint-role { color:#059669; opacity:1; }
      .vint-review { white-space:pre-wrap; background:rgba(59,130,246,.07); border:1px solid rgba(59,130,246,.16); border-radius:10px; padding:10px; max-height:360px; overflow:auto; }
      .vint-mic { width:18px; height:18px; vertical-align:-4px; }
      .vint-history { border:1px solid rgba(120,120,130,.2); border-radius:10px; max-height:200px; overflow:auto; }
      .vint-histrow { display:flex; gap:8px; padding:6px 10px; border-bottom:1px solid rgba(120,120,130,.10); align-items:center; font-size:12px; }
      .vint-histrow:last-child { border-bottom:0; }
      .vint-histrow span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      @keyframes vintPulse { 0%{transform:scale(1);opacity:1} 70%{transform:scale(1.7);opacity:0} 100%{transform:scale(1.7);opacity:0} }
      .vint-dot { position:relative; width:10px; height:10px; border-radius:50%; background:#ef4444; display:inline-block; }
      .vint-dot:after { content:''; position:absolute; inset:0; border-radius:50%; background:#ef4444; animation:vintPulse 1.2s infinite; }
    `)
    ctx.effect(() => disposeStyle)

    const QUESTION_TYPES = ['项目深挖', '系统设计', '编程语言基础', '八股/原理', '行为面试', '线上故障/调试', '算法/编码', '工程实践']

    function h(type, props, children) { return React.createElement(type, props, children) }

    function MicIcon() {
      return React.createElement('svg', {
        className: 'vint-mic', viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoinround: 'round',
      },
        React.createElement('rect', { x: '9', y: '2', width: '6', height: '12', rx: '3' }),
        React.createElement('path', { d: 'M5 10a7 7 0 0 0 14 0' }),
        React.createElement('line', { x1: '12', y1: '19', x2: '12', y2: '22' }))
    }

    function App() {
      const [profile, setProfile] = React.useState({
        project: '', language: '', resume: '',
        targetRole: '',
        seniority: '高级工程师，注重系统设计、性能优化和线上问题排查',
        questionCount: '8',
        questionTypes: ['项目深挖', '系统设计'],
      })
      const [phase, setPhase] = React.useState('setup')
      const [listening, setListening] = React.useState(false)
      const [thinking, setThinking] = React.useState(false)
      const [transcript, setTranscript] = React.useState([])
      const [review, setReview] = React.useState('')
      const [status, setStatus] = React.useState('准备开始：填写信息、上传简历，选择题型，然后开始语音面试。')
      const [recognition, setRecognition] = React.useState(null)
      const [voices, setVoices] = React.useState([])
      const [savedPath, setSavedPath] = React.useState('')
      const [history, setHistory] = React.useState([])
      const [selected, setSelected] = React.useState([])
      const [compareReport, setCompareReport] = React.useState('')
      const [tab, setTab] = React.useState('review') // review | history

      React.useEffect(() => {
        if (typeof speechSynthesis !== 'undefined') {
          const load = () => setVoices(speechSynthesis.getVoices())
          load()
          speechSynthesis.onvoiceschanged = load
        }
        host.call('listHistory', {}).then(r => { if (r && r.ok) setHistory(r.history || []) }).catch(() => {})
        return () => { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel() }
      }, [])

      function update(k, v) { setProfile(p => ({ ...p, [k]: v })) }
      function toggleType(t) {
        setProfile(p => ({
          ...p,
          questionTypes: p.questionTypes.includes(t)
            ? p.questionTypes.filter(x => x !== t)
            : [...p.questionTypes, t],
        }))
      }
      function speak(text) {
        if (typeof speechSynthesis === 'undefined') return
        speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'zh-CN'; u.rate = 1
        const zh = voices.find(v => /zh|Chinese|Mandarin/i.test(v.lang + v.name))
        if (zh) u.voice = zh
        speechSynthesis.speak(u)
      }
      function addMessage(role, text) {
        setTranscript(t => [...t, { role, text, at: new Date().toLocaleTimeString() }])
      }

      function onUpload(ev) {
        const file = ev.target.files && ev.target.files[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) {
          setStatus('简历文件过大（>5MB），请压缩后重试。')
          return
        }
        setStatus('正在读取并解析简历…')
        const lower = file.name.toLowerCase()
        const isBinary = lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc')
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            if (isBinary) {
              // Convert ArrayBuffer -> base64 and ask Host to parse.
              const buf = reader.result
              const bytes = new Uint8Array(buf)
              let binary = ''
              const chunk = 0x8000
              for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
              }
              const base64 = (typeof btoa !== 'undefined' ? btoa : () => '')(binary)
              const res = await host.call('parseResume', {
                filename: file.name, mime: file.type, base64,
              })
              if (res && res.ok) {
                update('resume', res.text)
                setStatus('已解析简历：' + file.name + '（' + file.size + ' bytes）')
              } else {
                setStatus('简历解析失败：' + ((res && res.error) || '未知错误') + '。可直接粘贴文本。')
              }
            } else {
              const text = String(reader.result || '')
              update('resume', text.slice(0, 20000))
              setStatus('已读取简历：' + file.name + '（' + file.size + ' bytes）')
            }
          } catch (e) {
            setStatus('简历解析异常：' + String(e) + '。可直接粘贴文本。')
          }
        }
        reader.onerror = () => setStatus('文件读取失败，请直接粘贴简历内容。')
        if (isBinary) reader.readAsArrayBuffer(file)
        else reader.readAsText(file, 'utf-8')
      }

      async function start() {
        setThinking(true); setStatus('正在根据你的背景、难度和题型生成面试题…')
        try {
          const res = await host.call('startInterview', {
            profile,
            resumeFile: null, // text already in profile.resume
          })
          if (res && res.ok) {
            setPhase('interview')
            addMessage('interviewer', res.question)
            setStatus('面试官提问中。准备好后点击麦克风回答。')
            speak(res.question)
          } else setStatus('启动失败：' + ((res && res.error) || '未知错误'))
        } catch (e) { setStatus('启动失败：' + String(e)) }
        setThinking(false)
      }

      function beginListen() {
        const SR = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition)
        if (!SR) { setStatus('当前浏览器不支持语音识别，请使用 Chrome/Edge 或用文字输入。'); return }
        if (recognition) recognition.stop()
        const rec = new SR()
        rec.lang = 'zh-CN'; rec.interimResults = false; rec.continuous = false
        let finalText = ''
        rec.onresult = (ev) => {
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript
          }
        }
        rec.onerror = () => setStatus('语音识别出错，请重试。')
        rec.onend = async () => {
          setListening(false); setRecognition(null)
          const answer = (finalText || '').trim()
          if (!answer) { setStatus('没有识别到回答，请重试。'); return }
          await submit(answer)
        }
        rec.start()
        setRecognition(rec); setListening(true); setStatus('正在聆听，请回答…')
      }

      async function submit(answer) {
        addMessage('you', answer); setThinking(true); setStatus('正在评估回答并生成下一题…')
        try {
          const res = await host.call('submitAnswer', { answer })
          if (res && res.ok) {
            if (res.done) {
              setPhase('review'); setReview(res.review); setSavedPath(res.savedPath || '')
              setStatus('面试结束，已生成复盘报告并写入记忆。')
              speak('面试结束。下面是你的复盘报告。')
              const hr = await host.call('listHistory', {})
              if (hr && hr.ok) setHistory(hr.history || [])
            } else {
              addMessage('interviewer', res.question)
              setStatus('继续回答第 ' + res.index + ' 题。')
              speak(res.question)
            }
          } else setStatus('提交失败：' + ((res && res.error) || '未知错误'))
        } catch (e) { setStatus('提交失败：' + String(e)) }
        setThinking(false)
      }

      async function submitText(ev) {
        if (ev.key !== 'Enter' || ev.shiftKey) return
        ev.preventDefault()
        const answer = (ev.target.value || '').trim()
        if (!answer) return
        ev.target.value = ''
        await submit(answer)
      }

      async function finish() {
        setThinking(true); setStatus('正在提前生成复盘…')
        const res = await host.call('finishInterview', {})
        if (res && res.ok) {
          setPhase('review'); setReview(res.review); setSavedPath(res.savedPath || '')
          setStatus('已生成复盘报告。')
          const hr = await host.call('listHistory', {})
          if (hr && hr.ok) setHistory(hr.history || [])
        } else setStatus('复盘失败：' + ((res && res.error) || '未知错误'))
        setThinking(false)
      }

      function exportMd() {
        const blob = new Blob([review], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'interview-review-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.md'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 500)
      }

      async function saveMemory() {
        setThinking(true); setStatus('正在写入记忆/工作区…')
        const res = await host.call('saveMemory', { review, transcript, profile })
        if (res && res.ok) { setSavedPath(res.path || ''); setStatus('已写入记忆：' + res.path) }
        else setStatus('写入失败：' + ((res && res.error) || '未知错误'))
        setThinking(false)
      }

      function toggleHist(name) {
        setSelected(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name])
      }

      async function compare() {
        if (!selected.length) { setStatus('请先选择要对比的历史面试。'); return }
        setThinking(true); setStatus('正在分析历史趋势…')
        const res = await host.call('compareHistory', { names: selected })
        if (res && res.ok) { setCompareReport(res.report); setTab('history') }
        else setStatus('对比失败：' + ((res && res.error) || '未知错误'))
        setThinking(false)
      }

      function reset() {
        if (recognition) recognition.stop()
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
        setPhase('setup'); setTranscript([]); setReview(''); setSavedPath('')
        setCompareReport(''); setTab('review')
        setStatus('已重置，可以开始新的面试。')
      }

      const canStart = !thinking && profile.project.trim() && profile.language.trim() &&
        profile.resume.trim() && profile.targetRole.trim()

      return h('div', { className: 'vint-card' },
        h('div', { className: 'vint-title' },
          '🎙️ 语音面试复盘助手 ',
          h('span', { className: 'vint-badge' },
            phase === 'setup' ? '信息录入' : phase === 'interview' ? '面试中' : '复盘报告')),

        phase === 'setup' && h('div', { className: 'vint-grid' },
          h('label', { className: 'vint-field full' },
            h('span', { className: 'vint-label' }, '目标岗位 / 难度（自然语言）'),
            h('input', {
              className: 'vint-input', value: profile.targetRole,
              onChange: e => update('targetRole', e.target.value),
              placeholder: '例如：高级后端开发工程师 / 资深前端架构师 / 初级算法工程师',
            })),
          h('label', { className: 'vint-field full' },
            h('span', { className: 'vint-label' }, '面试风格 / 考察重点（自然语言，可选）'),
            h('input', {
              className: 'vint-input', value: profile.seniority,
              onChange: e => update('seniority', e.target.value),
              placeholder: '例如：偏 P7，深挖项目复杂度、技术选型、性能瓶颈、团队协作',
            })),
          h('label', { className: 'vint-field full' },
            h('span', { className: 'vint-label' }, '题目类型（可多选）'),
            h('div', { className: 'vint-chips' },
              QUESTION_TYPES.map(t => h('div', {
                key: t, className: 'vint-chip' + (profile.questionTypes.includes(t) ? ' on' : ''),
                onClick: () => toggleType(t),
              }, t)))),
          h('label', { className: 'vint-field' },
            h('span', { className: 'vint-label' }, '项目/经历'),
            h('input', {
              className: 'vint-input', value: profile.project,
              onChange: e => update('project', e.target.value),
              placeholder: '例如：电商订单系统、推荐平台',
            })),
          h('label', { className: 'vint-field' },
            h('span', { className: 'vint-label' }, '编程语言'),
            h('input', {
              className: 'vint-input', value: profile.language,
              onChange: e => update('language', e.target.value),
              placeholder: 'Go / Java / Python / TS',
            })),
          h('label', { className: 'vint-field full' },
            h('span', { className: 'vint-label' }, '上传简历（支持 PDF / DOCX / TXT / MD，≤5MB）'),
            h('label', { className: 'vint-file' },
              '📄 选择简历文件',
              h('input', {
                type: 'file',
                accept: '.txt,.md,.markdown,.json,.csv,.pdf,.docx,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                onChange: onUpload,
              }))),
          h('label', { className: 'vint-field full' },
            h('span', { className: 'vint-label' }, '简历内容（上传后可继续编辑）'),
            h('textarea', {
              className: 'vint-textarea', value: profile.resume,
              onChange: e => update('resume', e.target.value),
              placeholder: '也可以直接粘贴简历/自我介绍',
            })),
          h('label', { className: 'vint-field' },
            h('span', { className: 'vint-label' }, '题目数量'),
            h('input', {
              className: 'vint-input', type: 'number', min: '3', max: '15',
              value: profile.questionCount,
              onChange: e => update('questionCount', e.target.value),
            }))),

        h('div', { className: 'vint-actions' },
          phase === 'setup' && h('button', {
            className: 'vint-btn', disabled: !canStart, onClick: start,
          }, thinking ? '生成中…' : '开始语音面试'),
          phase === 'interview' && h('button', {
            className: 'vint-btn ' + (listening ? 'danger' : ''),
            disabled: thinking, onClick: beginListen,
          }, listening
            ? [h('span', { key: 'd', className: 'vint-dot', style: { marginRight: 6 } }), '停止并提交']
            : [React.createElement(MicIcon, { key: 'm' }), ' 语音回答']),
          phase === 'interview' && h('button', {
            className: 'vint-btn secondary', disabled: thinking, onClick: finish,
          }, '结束并复盘'),
          phase === 'review' && h('button', { className: 'vint-btn', onClick: exportMd }, '⬇ 导出 Markdown'),
          phase === 'review' && h('button', {
            className: 'vint-btn secondary', disabled: thinking, onClick: saveMemory,
          }, '💾 写入记忆'),
          phase !== 'setup' && h('button', {
            className: 'vint-btn secondary', onClick: reset,
          }, '重新开始')),

        phase === 'interview' && h('textarea', {
          className: 'vint-textarea',
          placeholder: '不方便说话？输入回答后按 Enter 提交（Shift+Enter 换行）',
          onKeyDown: submitText,
        }),

        h('div', { className: 'vint-status' }, status + (savedPath ? '\n记忆文件：' + savedPath : '')),

        transcript.length > 0 && h('div', { className: 'vint-transcript' },
          transcript.map((m, i) => h('div', {
            key: i, className: 'vint-msg ' + m.role,
          },
            h('div', { className: 'vint-role' }, m.role === 'interviewer' ? '面试官' : '你'),
            h('div', null, m.text)))),

        phase === 'review' && h('div', { className: 'vint-actions' },
          h('button', {
            className: 'vint-btn ' + (tab === 'review' ? '' : 'secondary'),
            onClick: () => setTab('review'),
          }, '复盘报告'),
          h('button', {
            className: 'vint-btn ' + (tab === 'history' ? '' : 'secondary'),
            onClick: () => setTab('history'),
          }, '历史对比 (' + history.length + ')')),

        phase === 'review' && tab === 'review' && h('div', { className: 'vint-review' }, review),

        phase === 'review' && tab === 'history' && h('div', null,
          history.length === 0
            ? h('div', { className: 'vint-status' }, '还没有历史记录。完成一次面试后会自动写入 .interview-memory/。')
            : h('div', { className: 'vint-history' },
              history.map(hr => h('label', { key: hr.name, className: 'vint-histrow' },
                h('input', {
                  type: 'checkbox',
                  checked: selected.includes(hr.name),
                  onChange: () => toggleHist(hr.name),
                }),
                h('span', null,
                  (hr.targetRole || '未命名') + ' · ' + (hr.date || '').slice(0, 10) +
                  (hr.avgScore ? ' · 均分 ' + hr.avgScore : '') +
                  (hr.topGaps && hr.topGaps.length ? ' · 短板: ' + hr.topGaps.slice(0, 3).join('/') : ''))))),
          h('div', { className: 'vint-actions', style: { marginTop: 8 } },
            h('button', {
              className: 'vint-btn', disabled: thinking || !selected.length, onClick: compare,
            }, '对比选中记录'),
            h('button', {
              className: 'vint-btn secondary', onClick: async () => {
                const r = await host.call('listHistory', {})
                if (r && r.ok) setHistory(r.history || [])
              },
            }, '刷新')),
          compareReport && h('div', { className: 'vint-review', style: { marginTop: 8 } }, compareReport)),
      )
    }

    slots.inject('tool.view.cordis', () => slots.register(
      { name: 'tool.view.cordis', key: 'self' },
      () => React.createElement(App),
    ))
  },
}
