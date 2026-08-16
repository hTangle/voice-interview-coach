/**
 * Voice Interview Coach — Client half (video-call style UI).
 *
 * Renders into the `tool.view.cordis` slot. Three phases:
 *   - lobby:   profile / resume / question-type configuration
 *   - call:    face-to-face interview stage with animated interviewer avatar,
 *              self camera PiP, caption bubble, wave/listen indicator, and a
 *              call-control bar (camera, mic, hang-up)
 *   - review:  structured review + history / multi-interview comparison
 *
 * Plain JavaScript (no JSX, no bundler). React is provided by DSH.
 */
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (!slots) return

    const disposeStyle = styles.insert(`
      .vint2 { font: 14px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; color:#e8ecf3; background:linear-gradient(160deg,#0b1220 0%,#111a2e 55%,#0b1220 100%); border-radius:14px; overflow:hidden; position:relative; min-height:520px; display:flex; flex-direction:column; }
      .vint2 * { box-sizing:border-box; }
      .vint2-topbar { display:flex; align-items:center; gap:10px; padding:12px 16px; background:rgba(255,255,255,.04); border-bottom:1px solid rgba(255,255,255,.06); }
      .vint2-dot { width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 8px #22c55e; }
      .vint2-dot.red { background:#ef4444; box-shadow:0 0 8px #ef4444; }
      .vint2-dot.amber { background:#f59e0b; box-shadow:0 0 8px #f59e0b; }
      .vint2-topbar .title { font-weight:700; font-size:14px; flex:1; }
      .vint2-topbar .sub { font-size:12px; opacity:.6; }
      .vint2-stage { flex:1; position:relative; display:flex; align-items:center; justify-content:center; padding:24px; min-height:380px; }
      .vint2-self { position:absolute; top:14px; right:14px; width:128px; height:96px; border-radius:12px; background:#000; border:1px solid rgba(255,255,255,.15); overflow:hidden; z-index:5; box-shadow:0 8px 24px rgba(0,0,0,.4); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#64748b; font-size:11px; gap:4px; }
      .vint2-self video { width:100%; height:100%; object-fit:cover; transform:scaleX(-1); }
      .vint2-avatar-wrap { position:relative; display:flex; flex-direction:column; align-items:center; gap:14px; }
      .vint2-ring { position:absolute; border-radius:50%; border:2px solid rgba(96,165,250,.35); pointer-events:none; }
      .vint2-ring.r1 { inset:-18px; animation:vint2Pulse 2.6s ease-out infinite; }
      .vint2-ring.r2 { inset:-18px; animation:vint2Pulse 2.6s ease-out .9s infinite; }
      .vint2-ring.r3 { inset:-18px; animation:vint2Pulse 2.6s ease-out 1.8s infinite; }
      .vint2-avatar { width:168px; height:168px; border-radius:50%; background:radial-gradient(circle at 30% 25%,#3b82f6 0%,#1e3a8a 70%,#0b1220 100%); box-shadow:0 20px 60px rgba(59,130,246,.35), inset 0 -10px 30px rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
      .vint2-avatar.speaking { animation:vint2Speak .9s ease-in-out infinite; }
      .vint2-avatar svg { width:130px; height:130px; }
      .vint2-mouth { transform-origin:55% 70%; transition:transform .08s; }
      .vint2-avatar.thinking { animation: vint2Think 2.4s ease-in-out infinite; }
      @keyframes vint2Think {
        0%,100% { transform: translateY(0) rotate(-2deg); }
        50%     { transform: translateY(-2px) rotate(2deg); }
      }
      .vint2-eye-shift { transform-origin: center; animation: vint2EyeDart 2.4s ease-in-out infinite; }
      @keyframes vint2EyeDart {
        0%,100% { transform: translate(0,0); }
        30%     { transform: translate(2px,-2px); }
        60%     { transform: translate(-2px,-1px); }
      }
      .vint2-blink { transform-origin: 50% 44%; animation: vint2Blink 4.2s infinite; }
      @keyframes vint2Blink {
        0%,92%,100% { transform: scaleY(0); }
        95%         { transform: scaleY(1); }
      }
      .vint2-thinking { display:flex; align-items:center; gap:8px; color:#93c5fd; font-size:12px; font-weight:600; }
      .vint2-dots { display:inline-flex; gap:4px; }
      .vint2-dots span { width:6px; height:6px; border-radius:50%; background:#60a5fa; animation:vint2Dot 1.1s ease-in-out infinite; }
      .vint2-dots span:nth-child(2){ animation-delay:.18s }
      .vint2-dots span:nth-child(3){ animation-delay:.36s }
      @keyframes vint2Dot { 0%,80%,100%{transform:scale(.6);opacity:.4} 40%{transform:scale(1);opacity:1} }
      .vint2-name { text-align:center; }
      .vint2-name .n { font-size:18px; font-weight:700; letter-spacing:.3px; }
      .vint2-name .r { font-size:12px; opacity:.65; margin-top:2px; }
      .vint2-caption { max-width:520px; min-height:48px; padding:12px 16px; background:rgba(255,255,255,.08); backdrop-filter:blur(8px); border-radius:14px; border:1px solid rgba(255,255,255,.1); font-size:14px; line-height:1.55; text-align:center; }
      .vint2-wave { display:flex; align-items:flex-end; gap:4px; height:36px; margin-top:6px; }
      .vint2-wave span { width:4px; border-radius:2px; background:linear-gradient(180deg,#60a5fa,#3b82f6); height:8px; }
      .vint2-wave.listening span { animation:vint2Wave .9s ease-in-out infinite; }
      .vint2-wave.listening span:nth-child(2){animation-delay:.1s}
      .vint2-wave.listening span:nth-child(3){animation-delay:.2s}
      .vint2-wave.listening span:nth-child(4){animation-delay:.3s}
      .vint2-wave.listening span:nth-child(5){animation-delay:.4s}
      .vint2-wave.listening span:nth-child(6){animation-delay:.5s}
      .vint2-wave.listening span:nth-child(7){animation-delay:.6s}
      .vint2-controls { display:flex; gap:14px; align-items:center; justify-content:center; padding:18px; background:rgba(0,0,0,.25); border-top:1px solid rgba(255,255,255,.06); }
      .vint2-ctrl { width:52px; height:52px; border-radius:50%; border:0; cursor:pointer; display:flex; align-items:center; justify-content:center; color:white; font-size:20px; transition:transform .12s, background .2s; background:rgba(255,255,255,.12); }
      .vint2-ctrl:hover { transform:scale(1.06); }
      .vint2-ctrl.mic.on { background:#2563eb; }
      .vint2-ctrl.mic.live { background:#ef4444; animation:vint2Pulse 1.4s infinite; }
      .vint2-ctrl.cam.on { background:#0ea5e9; }
      .vint2-ctrl.end { background:#dc2626; width:64px; border-radius:30px; }
      .vint2-ctrl:disabled { opacity:.4; cursor:not-allowed; }
      .vint2-ctrl-label { position:absolute; bottom:-18px; font-size:10px; opacity:.5; white-space:nowrap; }
      .vint2-ctrl-wrap { position:relative; display:flex; flex-direction:column; align-items:center; }
      .vint2-lobby { max-width:680px; width:100%; margin:0 auto; padding:18px; display:flex; flex-direction:column; gap:12px; }
      .vint2-lobby h2 { margin:0; font-size:20px; }
      .vint2-lobby p { margin:0; opacity:.65; font-size:13px; }
      .vint2-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .vint2-field { display:flex; flex-direction:column; gap:5px; }
      .vint2-field.full { grid-column:1/-1; }
      .vint2-field label { font-size:12px; opacity:.7; font-weight:600; }
      .vint2-field input,.vint2-field textarea { width:100%; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.05); color:inherit; border-radius:10px; padding:9px 11px; outline:none; font:inherit; }
      .vint2-field input:focus,.vint2-field textarea:focus { border-color:#3b82f6; }
      .vint2-field textarea { min-height:80px; resize:vertical; }
      .vint2-chips { display:flex; flex-wrap:wrap; gap:6px; }
      .vint2-chip { border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.04); border-radius:999px; padding:4px 11px; font-size:12px; cursor:pointer; user-select:none; }
      .vint2-chip.on { background:#2563eb; border-color:#2563eb; }
      .vint2-file { border:1px dashed rgba(255,255,255,.25); border-radius:10px; padding:10px; text-align:center; cursor:pointer; font-size:13px; }
      .vint2-file input { display:none; }
      .vint2-primary { background:linear-gradient(135deg,#3b82f6,#2563eb); color:white; border:0; border-radius:999px; padding:11px 22px; font-weight:700; cursor:pointer; font-size:14px; align-self:flex-start; }
      .vint2-primary:disabled { opacity:.5; cursor:not-allowed; }
      .vint2-ghost { background:rgba(255,255,255,.08); color:inherit; border:1px solid rgba(255,255,255,.15); border-radius:999px; padding:8px 16px; cursor:pointer; font-weight:600; }
      .vint2-status { font-size:12px; opacity:.7; padding:8px 12px; background:rgba(0,0,0,.25); }
      .vint2-review { max-width:760px; width:100%; margin:0 auto; padding:20px; overflow:auto; max-height:520px; }
      .vint2-review .md { white-space:pre-wrap; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:14px; font-size:13px; line-height:1.7; max-height:360px; overflow:auto; }
      .vint2-review .row { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
      .vint2-transcript { max-height:160px; overflow:auto; border:1px solid rgba(255,255,255,.08); border-radius:10px; margin-top:10px; font-size:12px; }
      .vint2-msg { padding:7px 10px; border-bottom:1px solid rgba(255,255,255,.06); }
      .vint2-msg:last-child { border-bottom:0; }
      .vint2-msg .r { font-size:10px; opacity:.55; text-transform:uppercase; font-weight:700; margin-bottom:2px; }
      .vint2-msg.q .r { color:#60a5fa; }
      .vint2-msg.a .r { color:#34d399; }
      .vint2-text-fallback { display:flex; gap:8px; width:100%; }
      .vint2-text-fallback input { flex:1; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.15); color:inherit; border-radius:999px; padding:9px 14px; outline:none; }
      .vint2-text-fallback button { background:rgba(255,255,255,.12); color:inherit; border:0; border-radius:999px; padding:0 16px; cursor:pointer; }
      .vint2-tabs { display:flex; gap:6px; margin-bottom:8px; }
      .vint2-tab { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); color:inherit; border-radius:999px; padding:6px 14px; cursor:pointer; font-size:12px; }
      .vint2-tab.on { background:#2563eb; border-color:#2563eb; }
      .vint2-tab:disabled { opacity:.4; cursor:not-allowed; }
      .vint2-histrow { display:flex; gap:8px; padding:7px 10px; border-bottom:1px solid rgba(255,255,255,.06); font-size:12px; align-items:center; }
      .vint2-histrow span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      @keyframes vint2Pulse { 0%{transform:scale(1);opacity:.8} 70%{transform:scale(1.25);opacity:0} 100%{transform:scale(1.25);opacity:0} }
      @keyframes vint2Speak { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
      @keyframes vint2Wave { 0%,100%{height:8px} 50%{height:30px} }
    `)
    ctx.effect(() => disposeStyle)

    const TYPES = ['项目深挖', '系统设计', '语言基础', '八股/原理', '行为面试', '线上故障', '算法/编码', '工程实践']
    const h = (t, p, c) => React.createElement(t, p, c)

    function InterviewerAvatar({ speaking, thinking }) {
      return h('div', {
        className: 'vint2-avatar' + (speaking ? ' speaking' : '') + (thinking ? ' thinking' : ''),
      },
        speaking && h('span', { className: 'vint2-ring r1' }),
        speaking && h('span', { className: 'vint2-ring r2' }),
        speaking && h('span', { className: 'vint2-ring r3' }),
        React.createElement('svg', { viewBox: '0 0 100 100' },
          React.createElement('defs', null,
            React.createElement('linearGradient', { id: 'v2g', x1: 0, y1: 0, x2: 0, y2: 1 },
              React.createElement('stop', { offset: 0, stopColor: '#fde68a' }),
              React.createElement('stop', { offset: 1, stopColor: '#f59e0b' }))),
          React.createElement('path', { d: 'M20 95 C20 72 80 72 80 95 Z', fill: '#1e3a8a' }),
          React.createElement('path', { d: 'M28 95 C28 78 72 78 72 95 Z', fill: '#2563eb' }),
          React.createElement('ellipse', { cx: 50, cy: 46, rx: 22, ry: 25, fill: 'url(#v2g)' }),
          React.createElement('path', { d: 'M28 40 C28 22 72 22 72 40 C66 32 60 30 50 30 C40 30 33 32 28 40 Z', fill: '#1f2937' }),
          // glasses frames
          React.createElement('circle', { cx: 42, cy: 48, r: 5, fill: 'none', stroke: '#111827', strokeWidth: 1.6 }),
          React.createElement('circle', { cx: 58, cy: 48, r: 5, fill: 'none', stroke: '#111827', strokeWidth: 1.6 }),
          React.createElement('line', { x1: 47, y1: 48, x2: 53, y2: 48, stroke: '#111827', strokeWidth: 1.4 }),
          // eyes (look around while thinking, blink periodically)
          React.createElement('g', { className: 'vint2-eye-shift' },
            React.createElement('circle', { cx: 42, cy: 48, r: 1.4, fill: '#111827' }),
            React.createElement('circle', { cx: 58, cy: 48, r: 1.4, fill: '#111827' })),
          // blink: a skin-colored eyelid periodically covers the eye line
          React.createElement('path', {
            className: 'vint2-blink',
            d: 'M34 48 Q50 43 66 48 L66 50 Q50 55 34 50 Z',
            fill: 'url(#v2g)',
          }),
          React.createElement('g', {
            className: 'vint2-mouth',
            style: speaking
              ? { transform: 'scaleY(1.4)' }
              : thinking
                ? { transform: 'scaleY(0.5) translateY(2px)' }
                : { transform: 'scaleY(1)' },
          },
            React.createElement('path', {
              d: speaking
                ? 'M42 64 Q50 72 58 64 Q50 68 42 64 Z'
                : thinking
                  ? 'M44 66 Q50 67 56 66'
                  : 'M44 65 Q50 68 56 65',
              fill: speaking ? '#7f1d1d' : 'none',
              stroke: '#451a03', strokeWidth: 1.2,
            }))
        )
      )
    }

    function App() {
      const [profile, setProfile] = React.useState({
        project: '', language: '', resume: '',
        targetRole: '',
        seniority: '高级工程师，注重系统设计、性能优化和线上问题排查',
        questionCount: '6',
        questionTypes: ['项目深挖', '系统设计'],
      })
      const [phase, setPhase] = React.useState('lobby')
      const [listening, setListening] = React.useState(false)
      const [thinking, setThinking] = React.useState(false)
      const [speaking, setSpeaking] = React.useState(false)
      const [caption, setCaption] = React.useState('')
      const [transcript, setTranscript] = React.useState([])
      const [review, setReview] = React.useState('')
      const [savedPath, setSavedPath] = React.useState('')
      const [status, setStatus] = React.useState('准备进入面试间。')
      const [recognition, setRecognition] = React.useState(null)
      const [voices, setVoices] = React.useState([])
      const [camOn, setCamOn] = React.useState(false)
      const [videoEl, setVideoEl] = React.useState(null)
      const [cameraStream, setCameraStream] = React.useState(null)
      const [textAnswer, setTextAnswer] = React.useState('')
      const [history, setHistory] = React.useState([])
      const [selected, setSelected] = React.useState([])
      const [compareReport, setCompareReport] = React.useState('')
      const [tab, setTab] = React.useState('review')

      React.useEffect(() => {
        if (typeof speechSynthesis !== 'undefined') {
          const load = () => setVoices(speechSynthesis.getVoices())
          load(); speechSynthesis.onvoiceschanged = load
        }
        host.call('listHistory', {}).then(r => { if (r && r.ok) setHistory(r.history || []) }).catch(() => {})
        return () => {
          if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
          if (cameraStream) cameraStream.getTracks().forEach(t => t.stop())
        }
      }, [])

      React.useEffect(() => {
        if (videoEl) videoEl.srcObject = cameraStream
      }, [videoEl, cameraStream])

      const update = (k, v) => setProfile(p => ({ ...p, [k]: v }))
      const toggleType = t => setProfile(p => ({
        ...p,
        questionTypes: p.questionTypes.includes(t)
          ? p.questionTypes.filter(x => x !== t)
          : [...p.questionTypes, t],
      }))

      function speak(text) {
        if (typeof speechSynthesis === 'undefined') return
        speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'zh-CN'; u.rate = 1.02; u.pitch = 1
        const zh = voices.find(v => /zh|Chinese|Mandarin/i.test(v.lang + v.name))
        if (zh) u.voice = zh
        u.onstart = () => setSpeaking(true)
        u.onend = () => setSpeaking(false)
        u.onerror = () => setSpeaking(false)
        speechSynthesis.speak(u)
      }

      function addMsg(role, text) { setTranscript(t => [...t, { role, text }]) }

      async function toggleCam() {
        if (camOn) {
          if (cameraStream) cameraStream.getTracks().forEach(t => t.stop())
          setCameraStream(null); setCamOn(false); return
        }
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          setCameraStream(s); setCamOn(true)
        } catch (e) { setStatus('无法打开摄像头：' + String(e)) }
      }

      function onUpload(ev) {
        const file = ev.target.files && ev.target.files[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) { setStatus('简历文件过大（>5MB）。'); return }
        setStatus('正在读取并解析简历…')
        const lower = file.name.toLowerCase()
        const isBinary = lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc')
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            if (isBinary) {
              const bytes = new Uint8Array(reader.result)
              let binary = ''; const chunk = 0x8000
              for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
              }
              const base64 = (typeof btoa !== 'undefined' ? btoa : () => '')(binary)
              const res = await host.call('parseResume', { filename: file.name, mime: file.type, base64 })
              if (res && res.ok) { update('resume', res.text); setStatus('已解析简历：' + file.name) }
              else setStatus('简历解析失败：' + ((res && res.error) || '未知错误') + '。可直接粘贴文本。')
            } else {
              update('resume', String(reader.result || '').slice(0, 20000))
              setStatus('已读取简历：' + file.name)
            }
          } catch (e) { setStatus('简历解析异常：' + String(e)) }
        }
        if (isBinary) reader.readAsArrayBuffer(file)
        else reader.readAsText(file, 'utf-8')
      }

      async function start() {
        setThinking(true); setStatus('正在连接面试官…')
        const res = await host.call('startInterview', { profile })
        if (res && res.ok) {
          setPhase('call')
          addMsg('q', res.question); setCaption(res.question)
          setStatus('面试进行中'); speak(res.question)
        } else setStatus('启动失败：' + ((res && res.error) || '未知错误'))
        setThinking(false)
      }

      function toggleMic() {
        const SR = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition)
        if (!SR) { setStatus('当前浏览器不支持语音识别，请用下方文字输入。'); return }
        if (listening) { if (recognition) recognition.stop(); return }
        if (recognition) recognition.stop()
        const rec = new SR()
        rec.lang = 'zh-CN'; rec.interimResults = false; rec.continuous = false
        let finalText = ''
        rec.onresult = ev => {
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript
          }
        }
        rec.onerror = () => { setStatus('语音识别出错，请重试。'); setListening(false) }
        rec.onend = async () => {
          setListening(false); setRecognition(null)
          const answer = (finalText || '').trim()
          if (answer) await submit(answer)
        }
        rec.start(); setRecognition(rec); setListening(true); setStatus('正在聆听…')
      }

      async function submit(answer) {
        addMsg('a', answer)
        setThinking(true); setStatus('面试官正在思考…'); setCaption(answer.slice(0, 120))
        const res = await host.call('submitAnswer', { answer })
        if (res && res.ok) {
          if (res.done) {
            setPhase('review'); setReview(res.review); setSavedPath(res.savedPath || '')
            setStatus('面试结束'); speak('面试结束，下面是你的复盘报告。')
            const hr = await host.call('listHistory', {})
            if (hr && hr.ok) setHistory(hr.history || [])
          } else {
            addMsg('q', res.question); setCaption(res.question)
            setStatus('第 ' + res.index + ' 题'); speak(res.question)
          }
        } else setStatus('提交失败：' + ((res && res.error) || '未知错误'))
        setThinking(false)
      }

      function submitText() {
        const v = textAnswer.trim()
        if (!v) return
        setTextAnswer(''); submit(v)
      }

      async function hangup() {
        if (recognition) recognition.stop()
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
        setThinking(true); setStatus('正在生成复盘…')
        const res = await host.call('finishInterview', {})
        if (res && res.ok) {
          setPhase('review'); setReview(res.review); setSavedPath(res.savedPath || '')
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
        a.download = 'interview-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.md'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 500)
      }

      async function saveMemory() {
        const res = await host.call('saveMemory', { review, transcript, profile })
        if (res && res.ok) { setSavedPath(res.path || ''); setStatus('已写入：' + res.path) }
      }

      function restart() {
        setPhase('lobby'); setTranscript([]); setReview(''); setCaption('')
        setSavedPath(''); setCompareReport(''); setTab('review')
        setStatus('准备进入面试间。')
      }

      async function compare() {
        if (!selected.length) return
        setThinking(true)
        const res = await host.call('compareHistory', { names: selected })
        if (res && res.ok) { setCompareReport(res.report); setTab('compare') }
        setThinking(false)
      }

      // ---------- render ----------
      if (phase === 'lobby') {
        const canStart = !thinking && profile.project.trim() && profile.language.trim() &&
          profile.resume.trim() && profile.targetRole.trim()
        return h('div', { className: 'vint2' },
          h('div', { className: 'vint2-topbar' },
            h('span', { className: 'vint2-dot' }),
            h('span', { className: 'title' }, '🎙️ 语音面试间'),
            h('span', { className: 'sub' }, '准备中')),
          h('div', { className: 'vint2-lobby' },
            h('h2', null, '准备进入模拟面试间'),
            h('p', null, '对面将由 AI 面试官扮演真人角色。建议打开摄像头，进入更接近真实视频面试的状态。'),
            h('div', { className: 'vint2-grid' },
              h('label', { className: 'vint2-field full' },
                h('label', null, '目标岗位 / 难度（自然语言）'),
                h('input', { value: profile.targetRole, onChange: e => update('targetRole', e.target.value), placeholder: '例如：高级后端开发工程师，要求高并发和系统设计' })),
              h('label', { className: 'vint2-field full' },
                h('label', null, '面试风格 / 考察重点'),
                h('input', { value: profile.seniority, onChange: e => update('seniority', e.target.value) })),
              h('label', { className: 'vint2-field full' },
                h('label', null, '题型（多选）'),
                h('div', { className: 'vint2-chips' },
                  TYPES.map(t => h('div', {
                    key: t,
                    className: 'vint2-chip' + (profile.questionTypes.includes(t) ? ' on' : ''),
                    onClick: () => toggleType(t),
                  }, t)))),
              h('label', { className: 'vint2-field' },
                h('label', null, '项目/经历'),
                h('input', { value: profile.project, onChange: e => update('project', e.target.value) })),
              h('label', { className: 'vint2-field' },
                h('label', null, '编程语言'),
                h('input', { value: profile.language, onChange: e => update('language', e.target.value) })),
              h('label', { className: 'vint2-field full' },
                h('label', null, '上传简历（PDF/DOCX/TXT/MD，≤5MB）'),
                h('label', { className: 'vint2-file' },
                  '📄 选择简历文件',
                  h('input', {
                    type: 'file',
                    accept: '.txt,.md,.markdown,.json,.csv,.pdf,.docx,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    onChange: onUpload,
                  }))),
              h('label', { className: 'vint2-field full' },
                h('label', null, '简历内容（可继续编辑）'),
                h('textarea', { value: profile.resume, onChange: e => update('resume', e.target.value) })),
              h('label', { className: 'vint2-field' },
                h('label', null, '题目数量'),
                h('input', {
                  type: 'number', min: 3, max: 15,
                  value: profile.questionCount,
                  onChange: e => update('questionCount', e.target.value),
                }))),
            h('button', {
              className: 'vint2-primary', disabled: !canStart, onClick: start,
            }, thinking ? '连接中…' : '▶  进入面试间'))
        )
      }

      if (phase === 'review') {
        return h('div', { className: 'vint2' },
          h('div', { className: 'vint2-topbar' },
            h('span', { className: 'vint2-dot amber' }),
            h('span', { className: 'title' }, '面试复盘'),
            h('span', { className: 'sub' }, savedPath ? ('已保存 ' + savedPath.split('/').pop()) : '未保存')),
          h('div', { className: 'vint2-review' },
            h('div', { className: 'vint2-tabs' },
              h('button', { className: 'vint2-tab' + (tab === 'review' ? ' on' : ''), onClick: () => setTab('review') }, '复盘报告'),
              h('button', { className: 'vint2-tab' + (tab === 'history' ? ' on' : ''), onClick: () => setTab('history') }, '历史 (' + history.length + ')'),
              h('button', { className: 'vint2-tab' + (tab === 'compare' ? ' on' : ''), onClick: () => setTab('compare'), disabled: !compareReport }, '对比结果')),
            tab === 'review' && h('div', { className: 'md' }, review),
            tab === 'history' && h('div', null,
              history.length === 0
                ? h('p', null, '暂无历史记录。')
                : h('div', { className: 'vint2-transcript' },
                  history.map(hr => h('label', { key: hr.name, className: 'vint2-histrow' },
                    h('input', {
                      type: 'checkbox',
                      checked: selected.includes(hr.name),
                      onChange: () => setSelected(s => s.includes(hr.name) ? s.filter(x => x !== hr.name) : [...s, hr.name]),
                    }),
                    h('span', null,
                      (hr.targetRole || '未命名') + ' · ' + (hr.date || '').slice(0, 10) +
                      (hr.avgScore ? ' · 均分 ' + hr.avgScore : '') +
                      (hr.topGaps && hr.topGaps.length ? ' · 短板: ' + hr.topGaps.slice(0, 3).join('/') : ''))))),
              h('div', { className: 'row' },
                h('button', { className: 'vint2-ghost', onClick: compare, disabled: !selected.length }, '对比选中记录'),
                h('button', {
                  className: 'vint2-ghost',
                  onClick: async () => {
                    const r = await host.call('listHistory', {})
                    if (r && r.ok) setHistory(r.history || [])
                  },
                }, '刷新'))),
            tab === 'compare' && h('div', { className: 'md' }, compareReport || '请先在「历史」中选择记录并点击对比。'),
            h('div', { className: 'row' },
              h('button', { className: 'vint2-primary', onClick: exportMd }, '⬇ 导出 Markdown'),
              h('button', { className: 'vint2-ghost', onClick: saveMemory }, '💾 写入记忆'),
              h('button', { className: 'vint2-ghost', onClick: restart }, '🔁 再面一次'))
          )
        )
      }

      // call phase
      return h('div', { className: 'vint2' },
        h('div', { className: 'vint2-topbar' },
          h('span', { className: 'vint2-dot' + (listening ? ' red' : '') }),
          h('span', { className: 'title' },
            listening ? '🎙 正在聆听'
              : thinking ? '⏳ 面试官思考中'
                : speaking ? '🗣 面试官发言'
                  : '面试进行中'),
          h('span', { className: 'sub' }, '面试官 · 资深' + (profile.targetRole || '工程师'))),
        h('div', { className: 'vint2-stage' },
          h('div', { className: 'vint2-self' },
            camOn
              ? React.createElement('video', { ref: setVideoEl, autoPlay: true, muted: true, playsInline: true })
              : h('div', { className: 'off' }, '📷', '摄像头未开启')),
          h('div', { className: 'vint2-avatar-wrap' },
            React.createElement(InterviewerAvatar, { speaking: speaking, thinking: thinking }),
            h('div', { className: 'vint2-name' },
              h('div', { className: 'n' }, thinking ? '面试官 · Alex 思考中' : '面试官 · Alex'),
              h('div', { className: 'r' }, (profile.targetRole || '技术面试') + ' · ' + (profile.seniority || '资深'))),
            thinking
              ? h('div', { className: 'vint2-thinking' },
                h('span', { className: 'vint2-dots' }, h('span'), h('span'), h('span')),
                '正在思考下一个问题…')
              : h('div', { className: 'vint2-caption' }, caption || '（等待面试官提问…）'),
            listening && h('div', { className: 'vint2-wave listening' },
              h('span'), h('span'), h('span'), h('span'), h('span'), h('span'), h('span'))
          )),
        h('div', { style: { position: 'absolute', bottom: 84, left: '50%', transform: 'translateX(-50%)', width: '60%', maxWidth: 520 } },
          h('div', { className: 'vint2-text-fallback' },
            h('input', {
              value: textAnswer,
              onChange: e => setTextAnswer(e.target.value),
              onKeyDown: e => { if (e.key === 'Enter') submitText() },
              placeholder: '不方便说话？输入回答后回车…',
            }),
            h('button', { onClick: submitText }, '发送'))),
        h('div', { className: 'vint2-controls' },
          h('div', { className: 'vint2-ctrl-wrap' },
            h('button', { className: 'vint2-ctrl cam' + (camOn ? ' on' : ''), onClick: toggleCam }, '📷'),
            h('span', { className: 'vint2-ctrl-label' }, '摄像头')),
          h('div', { className: 'vint2-ctrl-wrap' },
            h('button', {
              className: 'vint2-ctrl mic' + (listening ? ' live' : ' on'),
              onClick: toggleMic, disabled: thinking,
            }, listening ? '■' : '🎤'),
            h('span', { className: 'vint2-ctrl-label' }, listening ? '点击结束' : '语音回答')),
          h('div', { className: 'vint2-ctrl-wrap' },
            h('button', { className: 'vint2-ctrl end', onClick: hangup, disabled: thinking }, '📞'),
            h('span', { className: 'vint2-ctrl-label' }, '结束并复盘'))
        ),
        h('div', { className: 'vint2-status' }, status + (savedPath ? ' · ' + savedPath : ''))
      )
    }

    slots.inject('tool.view.cordis', () => slots.register(
      { name: 'tool.view.cordis', key: 'self' },
      () => React.createElement(App),
    ))
  },
}
