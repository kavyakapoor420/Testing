#   Engineering Plan

> One-on-one AI tutor using tldraw (canvas) + Claude (brain) + Gemini (voice).
> The agent explains concepts by drawing and speaking simultaneously.
> This document is the single source of truth for all engineers.

---

## Stack

| Layer | Technology |
|---|---|
| Canvas + Agent | tldraw Agent Starter Kit |
| AI Brain | Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) |
| STT | Gemini 2.0 Flash (audio → transcript) |
| TTS | Gemini 2.0 Flash Preview TTS (text → audio) |
| Backend | Cloudflare Worker (included in tldraw starter kit) |
| Frontend | React + Vite (included in tldraw starter kit) |

## API Keys Required

```
ANTHROPIC_API_KEY=...     # Claude — from console.anthropic.com
GOOGLE_API_KEY=...        # Gemini STT + TTS — from ai.google.dev
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│                                                             │
│  ┌──────────────────────┐    ┌────────────────────────┐    │
│  │   tldraw Canvas      │    │    Tutor Chat Panel    │    │
│  │                      │    │                        │    │
│  │  Agent draws shapes, │    │  Conversation text     │    │
│  │  writes text,        │    │  Subject selector      │    │
│  │  diagrams, labels    │    │  🎤 Mute/Unmute button │    │
│  │  all via Claude      │    │  Voice status indicator│    │
│  └──────────────────────┘    └────────────────────────┘    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Voice Layer (client-side)               │  │
│  │  MediaRecorder → silence detect → audio blob        │  │
│  │  AudioQueue → sentence TTS → Web Audio playback     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP / WebSocket
┌────────────────────────────▼────────────────────────────────┐
│                  Cloudflare Worker (Backend)                 │
│                                                             │
│   /agent  → tldraw agent WebSocket (Claude + canvas)       │
│   /stt    → receives audio blob → Gemini STT → transcript  │
│   /tts    → receives sentence text → Gemini TTS → audio    │
└─────────────────────────────────────────────────────────────┘
```

**Key flow:**
```
User unmutes → speaks → silence detected → audio blob → POST /stt
→ transcript → agent.prompt(transcript) → Claude streams
    ├── canvas actions → tldraw draws shapes/text (visual)
    └── message action → sentence detected → POST /tts → audio plays (voice)
         (both happen in parallel)
→ TTS finishes → mic auto-unmutes → back to listening
```

---

## File Structure (post-scaffold)

```
agent/                              ← project root (already scaffolded)
├── client/
│   ├── components/
│   │   ├── ChatPanel.tsx           ← EDIT: replace with TutorPanel UI
│   │   └── TutorPanel.tsx          ← NEW: tutor chat panel
│   ├── hooks/
│   │   ├── useVoiceInput.ts        ← NEW: MediaRecorder + silence detection
│   │   └── useVoiceOutput.ts       ← NEW: TTS audio queue + playback
│   ├── actions/
│   │   └── MessageActionUtil.ts    ← EDIT: dispatch TTS event on message
│   ├── parts/
│   │   └── SessionTrackerPartUtil.ts ← NEW: topic memory
│   └── App.tsx                     ← EDIT: wire voice hooks + TutorPanel
├── worker/
│   ├── do/
│   │   └── AgentService.ts         ← tldraw agent handler (unchanged)
│   ├── prompt/
│   │   ├── buildSystemPrompt.ts    ← EDIT: add tutor section
│   │   └── sections/
│   │       └── tutor-section.ts    ← NEW: tutor persona rules
│   ├── routes/
│   │   ├── stt.ts                  ← NEW: Gemini STT endpoint
│   │   └── tts.ts                  ← NEW: Gemini TTS endpoint
│   └── worker.ts                   ← EDIT: register /stt and /tts routes
├── shared/
│   └── models.ts                   ← claude-sonnet-4-5 already default
├── .dev.vars                       ← local secrets (Cloudflare Worker)
└── plan.md
```

---

## Phase 1 — Scaffold & Verify Base Agent

**Goal:** tldraw agent running locally, Claude drawing on canvas.

### Steps

**1. Add environment variables**

Cloudflare Workers uses `.dev.vars` for local secrets (not `.env`):
```bash
# agent/.dev.vars
ANTHROPIC_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
```

`claude-sonnet-4-5` is already set as `DEFAULT_MODEL_NAME` in `shared/models.ts` — no changes needed there.

**2. Run dev server**
```bash
cd agent
npm run dev
```

### Phase 1 Test

Open `localhost:5173`. In the chat panel, type:
```
Draw a labeled diagram of the water cycle
```
Expected: Agent draws shapes on canvas with labels. Chat panel shows action cards.

**Pass criteria:** Shapes appear on canvas. Claude responds. No console errors.

---

## Phase 2 — Tutor Persona (System Prompt)

**Goal:** Claude behaves as a Socratic tutor, explains concepts on canvas without narrating drawing actions.

### Create `worker/prompt/sections/tutor-section.ts`

The system prompt is built in `worker/prompt/buildSystemPrompt.ts` by composing section functions. Add a new section and import it there.

```ts
// worker/prompt/sections/tutor-section.ts
export function buildTutorPromptSection(): string {
  return `
## Tutor Identity

You are Feynman, a world-class 1:1 tutor named after Richard Feynman.
Your job is to explain concepts clearly using both speech (message actions) and the canvas.

## Teaching Style
- Always start by asking what the student already knows about the topic
- Break explanations into clear steps — draw each step on the canvas
- Ask one comprehension question between major steps
- Never re-explain something already covered unless explicitly asked
- Reference what's on the canvas: "As you can see here...", "Notice how these two relate..."

## Canvas Usage
- Use the canvas heavily — diagrams, labeled sketches, equations, flowcharts
- Write key terms and definitions as text shapes
- Use arrows to show relationships and flow
- Color-code related concepts (use consistent colors per concept)

## Message Rules
- NEVER say "I'm drawing...", "Let me add...", "Now I'll create..."
- Speak ONLY about the concept itself as if the visuals already exist
- Keep each message SHORT (2-4 sentences max)
- Write as if pointing at a whiteboard the student can see

## Response Structure (always follow this order)
1. Send a message action first (what you'll say)
2. Then send canvas actions (what you'll draw)

## Memory
- Track what topics you've covered this session
- Do not repeat yourself — build on previous explanations
`.trim()
}
```

Then add it to `worker/prompt/buildSystemPrompt.ts`:
```ts
// worker/prompt/buildSystemPrompt.ts
import { buildTutorPromptSection } from './sections/tutor-section'

// inside buildSystemPrompt():
const lines = [buildIntroPromptSection(flags), buildTutorPromptSection(), buildRulesPromptSection(flags)]
```

### Phase 2 Test

Type in chat:
```
Explain Newton's First Law
```
Expected:
- Claude asks what student knows first
- Draws a diagram (object at rest, object in motion)
- Text explanation does NOT say "I'm drawing a circle"
- Says something like "As you can see, an object in motion continues moving..."

**Pass criteria:** No drawing narration in Claude's text. Tutor-like back-and-forth. Canvas has relevant diagram.

---

## Phase 3 — STT: Voice Input

**Goal:** User speaks → transcript → `agent.prompt()`. Mic toggles on/off. Auto-mutes while Claude speaks.

### 3a. Backend STT endpoint in Worker

```ts
// worker/routes/stt.ts
export async function handleSTT(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData()
  const audioBlob = formData.get('audio') as File
  const audioBase64 = Buffer.from(await audioBlob.arrayBuffer()).toString('base64')
  const mimeType = audioBlob.type // 'audio/webm;codecs=opus'

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64,
              }
            },
            { text: 'Transcribe this audio exactly. Return only the transcribed text, nothing else.' }
          ]
        }]
      })
    }
  )

  const data = await response.json()
  const transcript = data.candidates[0].content.parts[0].text.trim()
  return Response.json({ transcript })
}
```

Register in the worker router (`worker/worker.ts` uses `itty-router`):
```ts
// worker/worker.ts
import { handleSTT } from './routes/stt'

const router = AutoRouter(...)
  .post('/stream', stream)
  .post('/stt', (req, env) => handleSTT(req, env))  // add this line
```

### 3b. Silence Detection Hook (client)

```ts
// client/hooks/useVoiceInput.ts
import { useRef, useState, useCallback } from 'react'

const SILENCE_THRESHOLD = 15    // volume level (0-255) below which = silence
const SILENCE_DURATION_MS = 1500 // 1.5s of silence = end of speech

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [isMuted, setIsMuted] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startListening = useCallback(async () => {
    if (isMuted) return

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // Set up silence detection via Web Audio API
    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    analyserRef.current = analyser

    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' })
      if (audioBlob.size < 1000) return // ignore tiny blobs (silence clicks)

      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const res = await fetch('/stt', { method: 'POST', body: formData })
      const { transcript } = await res.json()
      if (transcript) onTranscript(transcript)
    }

    mediaRecorder.start()
    setIsListening(true)

    // Poll analyser for silence
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const checkSilence = () => {
      if (!analyserRef.current) return
      analyser.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

      if (volume < SILENCE_THRESHOLD) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            mediaRecorder.stop()
            stream.getTracks().forEach(t => t.stop())
            setIsListening(false)
          }, SILENCE_DURATION_MS)
        }
      } else {
        // Sound detected — reset silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      }
      requestAnimationFrame(checkSilence)
    }
    checkSilence()
  }, [isMuted, onTranscript])

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev
      if (!next) startListening() // unmuted → start listening
      else {
        // muted → stop everything
        mediaRecorderRef.current?.stop()
        setIsListening(false)
      }
      return next
    })
  }, [startListening])

  return { isMuted, isListening, toggleMute, startListening }
}
```

### Phase 3 Test

Add a temporary `<pre>` element that shows the transcript:
```tsx
// App.tsx (temporary test)
const { toggleMute, isMuted } = useVoiceInput((text) => {
  console.log('Transcript:', text)
  setLastTranscript(text)
})
// render: <pre>{lastTranscript}</pre>
```

Speak a sentence. Check the console/pre for the transcript.

**Pass criteria:** Transcript appears correctly after ~1.5s of silence. Mute button stops listening. Unmute resumes.

---

## Phase 4 — TTS: Voice Output

**Goal:** Claude's write-message text → sentence chunks → Gemini TTS → audio plays in sync with canvas drawing.

### 4a. Backend TTS endpoint

```ts
// worker/routes/tts.ts
export async function handleTTS(request: Request, env: Env): Promise<Response> {
  const { text } = await request.json<{ text: string }>()

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-tts:generateContent?key=${env.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: { voice_name: 'Charon' } // clear, calm voice
            }
          }
        }
      })
    }
  )

  const data = await response.json()
  const audioBase64 = data.candidates[0].content.parts[0].inline_data.data
  const audioBuffer = Buffer.from(audioBase64, 'base64')

  return new Response(audioBuffer, {
    headers: { 'Content-Type': 'audio/wav' }
  })
}
```

Register in `worker/worker.ts`:
```ts
import { handleTTS } from './routes/tts'

const router = AutoRouter(...)
  .post('/stream', stream)
  .post('/stt', (req, env) => handleSTT(req, env))
  .post('/tts', (req, env) => handleTTS(req, env))  // add this line
```

### 4b. TTS Audio Queue Hook (client)

```ts
// client/hooks/useVoiceOutput.ts
import { useRef, useCallback } from 'react'

// Split text into speakable sentences
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

export function useVoiceOutput(onStart: () => void, onEnd: () => void) {
  const queueRef = useRef<string[]>([])
  const isPlayingRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const playNext = useCallback(async () => {
    if (queueRef.current.length === 0) {
      isPlayingRef.current = false
      onEnd()  // TTS done → signal to unmute mic
      return
    }

    const sentence = queueRef.current.shift()!
    isPlayingRef.current = true

    const res = await fetch('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sentence })
    })

    const arrayBuffer = await res.arrayBuffer()

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    const audioCtx = audioCtxRef.current
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const source = audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioCtx.destination)
    source.onended = () => playNext()  // chain next sentence
    source.start()
  }, [onEnd])

  // Called with a full or partial text block
  // Detects sentences and queues them
  const speak = useCallback((text: string) => {
    const sentences = splitIntoSentences(text)
    queueRef.current.push(...sentences)

    if (!isPlayingRef.current) {
      onStart() // TTS starting → signal to mute mic
      playNext()
    }
  }, [playNext, onStart])

  const stop = useCallback(() => {
    queueRef.current = []
    isPlayingRef.current = false
    audioCtxRef.current?.close()
    audioCtxRef.current = null
  }, [])

  return { speak, stop }
}
```

### 4c. Hook TTS into Claude's message stream

In the component where you render the tldraw agent, intercept `write-message` actions:

```tsx
// client/App.tsx (simplified)
const { speak, stop } = useVoiceOutput(
  () => setIsMuted(true),   // mute mic when speaking starts
  () => setIsMuted(false),  // unmute mic when speaking ends
)

// When agent emits a text message, pipe to TTS
// The tldraw agent exposes a callback — wire it here:
useEffect(() => {
  if (!agent) return
  // Listen for message events from agent stream
  agent.on('message', (msg: string) => {
    speak(msg)
  })
}, [agent])
```

> **Note:** The tldraw agent doesn't expose a direct event emitter.
> Intercept via the existing `MessageActionUtil` — it already handles the `message` action type (confirmed in `client/actions/MessageActionUtil.ts`).

#### Modify existing `MessageActionUtil.ts`

```ts
// client/actions/MessageActionUtil.ts
export const MessageActionUtil = registerActionUtil(
  class MessageActionUtil extends AgentActionUtil<MessageAction> {
    static override type = 'message' as const

    override applyAction(action: Streaming<MessageAction>) {
      if (!action.complete) return
      // Pipe completed message text to TTS
      window.dispatchEvent(new CustomEvent('agent-message', { detail: action.text }))
    }

    override getInfo(action: Streaming<MessageAction>) {
      return {
        description: action.text ?? '',
        canGroup: () => false,
      }
    }
  }
)
```

```tsx
// App.tsx
useEffect(() => {
  const handler = (e: CustomEvent) => speak(e.detail)
  window.addEventListener('agent-message', handler as EventListener)
  return () => window.removeEventListener('agent-message', handler as EventListener)
}, [speak])
```

### Phase 4 Test

Type in chat: `Explain what gravity is`

Expected:
- Claude's text response gets spoken aloud, sentence by sentence
- Canvas draws simultaneously (parallel)
- Voice does not narrate drawing ("I'm drawing...")
- After voice finishes, mic auto-unmutes (if mic was active)

**Pass criteria:** Audio plays. Sentences are clear. Canvas and voice run at the same time. No noticeable gap between sentences.

---

## Phase 5 — Full Voice Loop

**Goal:** Complete mic → STT → Claude → TTS → mic loop. End-to-end real-time tutor.

### Wire up the full loop in App.tsx

```tsx
// client/App.tsx
export function App() {
  const editor = useTldrawEditor()
  const agent = useTldrawAgent(editor)

  const { speak, stop: stopTTS } = useVoiceOutput(
    () => muteRef.current?.mute(),   // auto-mute mic when TTS starts
    () => muteRef.current?.unmute(), // auto-unmute when TTS ends
  )

  const { isMuted, isListening, toggleMute } = useVoiceInput(
    async (transcript) => {
      // User finished speaking → send to Claude
      await agent.prompt(transcript)
    }
  )

  return (
    <div className="feynman-layout">
      <div className="canvas-area">
        <Tldraw />
      </div>
      <TutorPanel
        agent={agent}
        isMuted={isMuted}
        isListening={isListening}
        onToggleMute={toggleMute}
        onSpeak={speak}
      />
    </div>
  )
}
```

### State machine for voice flow

```
IDLE
  └─[unmute]──→ LISTENING
                  └─[silence 1.5s]──→ PROCESSING (STT + Claude)
                                        └─[first sentence ready]──→ SPEAKING
                                                                       └─[TTS queue empty]──→ LISTENING
```

### Phase 5 Test

Full spoken conversation:
1. Click unmute
2. Say: "Can you explain how plants make food?"
3. Wait for STT → Claude → TTS

Expected:
- Transcript sent to Claude
- Claude draws photosynthesis diagram
- Voice explains the concept (not "I'm drawing")
- After speaking, mic automatically resumes listening
- Second question works correctly

**Pass criteria:** Full loop works twice in a row without manual intervention. Mic state transitions correctly.

---

## Phase 6 — Session Memory (No Repetition)

**Goal:** Claude tracks topics covered and doesn't repeat itself. References the canvas.

### Create `SessionTrackerPartUtil.ts`

```ts
// client/parts/SessionTrackerPartUtil.ts
import { PromptPartUtil, BasePromptPart } from '@tldraw/agent'

interface SessionState {
  topicsCovered: string[]
  conceptsOnCanvas: string[]
  studentStruggledWith: string[]
  turnCount: number
}

interface SessionPart extends BasePromptPart<'session-tracker'> {
  session: SessionState
}

// Persists across the session in memory
const sessionState: SessionState = {
  topicsCovered: [],
  conceptsOnCanvas: [],
  studentStruggledWith: [],
  turnCount: 0,
}

export class SessionTrackerPartUtil extends PromptPartUtil<SessionPart> {
  static override type = 'session-tracker' as const

  override getPart(): SessionPart {
    sessionState.turnCount++
    return { type: 'session-tracker', session: { ...sessionState } }
  }

  override buildContent({ session }: SessionPart) {
    if (session.turnCount <= 1) return []  // skip on first turn

    return [
      '## Session Context',
      `Topics already explained: ${session.topicsCovered.join(', ') || 'none yet'}`,
      `Currently on canvas: ${session.conceptsOnCanvas.join(', ') || 'nothing yet'}`,
      `Student struggled with: ${session.studentStruggledWith.join(', ') || 'nothing noted'}`,
      'Do not re-explain covered topics. Reference the canvas where relevant.',
    ]
  }

  // Call this after each Claude response to update state
  static updateTopics(topics: string[]) {
    sessionState.topicsCovered.push(...topics)
  }
}
```

Register the part by adding it to the parts list. Check `client/agent/TldrawAgentApp.ts` or `TldrawAgentAppProvider.tsx` for where existing parts are instantiated — add `SessionTrackerPartUtil` to that same list.

### Phase 6 Test

Have a multi-turn conversation:
1. "Explain Newton's First Law"  ← Claude explains + draws
2. "Now explain Newton's Second Law"  ← Claude should reference first law, not re-explain it
3. "What's the First Law again?"  ← Claude should refer to what's on canvas, not re-draw

**Pass criteria:** Claude says "as we covered" / "as you can see on the canvas" rather than re-explaining from scratch. Second question builds on the first.

---

## Phase 7 — UI

**Goal:** Clean tutor UI. Subject selector, voice status, polished layout.

### Layout (CSS)

```css
/* client/styles.css */
.feynman-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  height: 100vh;
  overflow: hidden;
}

.canvas-area {
  position: relative;
  height: 100vh;
}

.tutor-panel {
  display: flex;
  flex-direction: column;
  border-left: 1px solid #e5e5e5;
  background: #fafafa;
  height: 100vh;
}

.subject-bar {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #e5e5e5;
  flex-wrap: wrap;
}

.subject-chip {
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  font-size: 13px;
}

.subject-chip.active {
  background: #1a1a1a;
  color: white;
  border-color: #1a1a1a;
}

.conversation {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message.user {
  align-self: flex-end;
  background: #1a1a1a;
  color: white;
  padding: 8px 14px;
  border-radius: 16px 16px 4px 16px;
  max-width: 85%;
  font-size: 14px;
}

.message.agent {
  align-self: flex-start;
  background: white;
  border: 1px solid #e5e5e5;
  padding: 8px 14px;
  border-radius: 16px 16px 16px 4px;
  max-width: 85%;
  font-size: 14px;
}

.voice-bar {
  padding: 12px 16px;
  border-top: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  gap: 10px;
}

.mic-button {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: background 0.2s;
}

.mic-button.active  { background: #ef4444; color: white; }
.mic-button.muted   { background: #e5e5e5; color: #666; }

.voice-status {
  font-size: 12px;
  color: #888;
  flex: 1;
}

.text-input-row {
  display: flex;
  gap: 8px;
  padding: 0 16px 12px;
}

.text-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
```

### TutorPanel Component

```tsx
// client/components/TutorPanel.tsx
const SUBJECTS = ['Math', 'Physics', 'Chemistry', 'Biology', 'CS', 'History']

export function TutorPanel({ agent, isMuted, isListening, onToggleMute, onSpeak }) {
  const [subject, setSubject] = useState('Math')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('Click mic to start')

  const voiceStatusText = isMuted
    ? 'Microphone off'
    : isListening
    ? 'Listening...'
    : 'Processing...'

  const sendMessage = (text: string) => {
    setMessages(prev => [...prev, { role: 'user', text }])
    agent.prompt(`[Subject: ${subject}] ${text}`)
    setInputText('')
  }

  return (
    <div className="tutor-panel">
      {/* Subject selector */}
      <div className="subject-bar">
        {SUBJECTS.map(s => (
          <button
            key={s}
            className={`subject-chip ${subject === s ? 'active' : ''}`}
            onClick={() => setSubject(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Conversation — text only, no raw action cards */}
      <div className="conversation">
        {messages.length === 0 && (
          <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
            What would you like to learn today?
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>{msg.text}</div>
        ))}
      </div>

      {/* Voice controls */}
      <div className="voice-bar">
        <button
          className={`mic-button ${isMuted ? 'muted' : 'active'}`}
          onClick={onToggleMute}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>
        <span className="voice-status">{voiceStatusText}</span>
      </div>

      {/* Text input fallback */}
      <div className="text-input-row">
        <input
          className="text-input"
          placeholder="Or type your question..."
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage(inputText)}
        />
      </div>
    </div>
  )
}
```

### Phase 7 Test

Full manual walkthrough:
1. Load app — see canvas + tutor panel with subject chips
2. Select "Physics"
3. Click mic, say "Explain gravity"
4. Voice status shows "Listening..." then "Processing..."
5. Canvas draws, voice explains
6. Mic auto-unmutes, status returns to "Listening..."
7. Type a follow-up in text box, hit Enter — works same way

**Pass criteria:** UI is clean, subject selector works, voice status updates correctly, text input works as fallback.

---

## Phase 8 — End-to-End QA

**Goal:** Confirm everything works together. Fix any integration issues.

### QA Checklist

```
[ ] Phase 1: Agent draws on canvas via text prompt
[ ] Phase 2: Claude doesn't say "I'm drawing" — only explains concept
[ ] Phase 3: Mic toggle works. STT transcript is accurate
[ ] Phase 4: TTS plays sentence by sentence, parallel with canvas drawing
[ ] Phase 5: Full voice loop — 3 questions in a row without manual intervention
[ ] Phase 6: Second question about same topic references previous explanation
[ ] Phase 7: UI clean, subject selector prepends to prompt, text input fallback works
[ ] Canvas actions and voice are genuinely parallel (not sequential)
[ ] Mic auto-mutes when TTS starts, auto-unmutes when TTS ends
[ ] Session reset (agent.reset()) clears canvas + memory
```

### Demo Script (for testing / presentation)

```
Subject: Biology

Turn 1: "Explain photosynthesis"
  → Claude draws plant, sun, CO2 arrows, glucose output
  → Voice: "Photosynthesis is the process by which plants convert sunlight..."
  → [comprehension question from Claude]

Turn 2: "What's the role of chlorophyll?"
  → Claude highlights relevant part of existing diagram
  → Voice: "As you can see in the diagram, chlorophyll is the pigment that..."
  → Does NOT re-explain photosynthesis from scratch

Turn 3: "Can you show me the chemical equation?"
  → Claude writes the equation on canvas
  → Voice: "The overall reaction is: 6CO2 + 6H2O + light → C6H12O6 + 6O2"
```

---

## Environment Variables Reference

```bash
# agent/.dev.vars  (local development — Cloudflare Workers local secrets)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# Production — set via Wrangler CLI (never commit secrets to wrangler.toml)
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GOOGLE_API_KEY
```

---

## Known Limitations & Future Work

| Issue | Notes |
|---|---|
| Interruption handling | User speaks while TTS playing — call `agent.cancel()`, clear TTS queue, resume STT. Handle after core flow works. |
| Gemini TTS model name | Verify `gemini-2.0-flash-preview-tts` is the correct model ID at build time — check ai.google.dev |
| `message` action hook | Confirmed: intercept via `MessageActionUtil.ts`, action type `'message'`, text in `action.text` |
| SessionTracker updates | Currently manual — ideally auto-extracted from Claude's response |
| Mobile | Voice APIs have inconsistent support on iOS Safari |

---

