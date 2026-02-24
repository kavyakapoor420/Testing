import { useMemo, useState } from 'react'
import { Tldraw } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import ChatPanel from './components/ChatPanel'
import { api } from './lib/api'
import { parseSchemaFromCanvas, renderSchemaToCanvas } from './lib/canvasSchema'

export default function App() {
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('prompt')
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Describe your business in plain English. I will draw your first database model on canvas, then ask 5 focused questions one by one.'
    }
  ])
  const [draft, setDraft] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schema, setSchema] = useState(null)
  const [questions, setQuestions] = useState([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [sql, setSql] = useState('')
  const [editor, setEditor] = useState(null)

  const activeQuestion = useMemo(() => {
    if (mode !== 'questions') return null
    return questions[questionIndex] || null
  }, [mode, questions, questionIndex])

  const pushMessage = (role, content) => setMessages((prev) => [...prev, { role, content }])

  const askNextQuestionMessage = (list, index) => {
    const next = list[index]
    if (!next) {
      pushMessage('assistant', 'All clarifications captured. Click Generate SQL, or keep editing the canvas and sync.')
      setMode('ready')
      return
    }
    pushMessage('assistant', `Question ${index + 1}/${list.length}: ${next.question}`)
  }

  const handleStart = async (businessPrompt) => {
    setLoading(true)
    setSql('')
    try {
      const res = await api.generateInitial(businessPrompt)
      setSchema(res.schema)
      setQuestions(res.questions || [])
      setQuestionIndex(0)
      setAnswers({})
      setMode('questions')
      if (editor) {
        renderSchemaToCanvas(editor, res.schema)
      }
      pushMessage('assistant', 'Initial schema drafted on canvas. Now I need a few decisions to refine it.')
      askNextQuestionMessage(res.questions || [], 0)
    } catch (err) {
      pushMessage('assistant', `Failed to generate schema: ${err.message}`)
      setMode('prompt')
    } finally {
      setLoading(false)
    }
  }

  const handleAnswer = async (answerText) => {
    if (!activeQuestion) return

    const nextAnswers = { ...answers, [activeQuestion.id]: answerText }
    setAnswers(nextAnswers)
    pushMessage('user', answerText)

    const nextIndex = questionIndex + 1
    setQuestionIndex(nextIndex)

    if (nextIndex < questions.length) {
      askNextQuestionMessage(questions, nextIndex)
      return
    }

    setLoading(true)
    try {
      const res = await api.refine({ prompt, schema, answers: nextAnswers })
      setSchema(res.schema)
      if (editor) {
        renderSchemaToCanvas(editor, res.schema)
      }
      pushMessage('assistant', 'Schema refined using all your answers and redrawn on canvas.')
      setMode('ready')
    } catch (err) {
      pushMessage('assistant', `Refine failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    const text = draft.trim()
    if (!text || loading) return
    setDraft('')

    if (mode === 'prompt') {
      setPrompt(text)
      pushMessage('user', text)
      await handleStart(text)
      return
    }

    if (mode === 'questions') {
      await handleAnswer(text)
      return
    }

    pushMessage('user', text)
    pushMessage('assistant', 'For now, use Sync canvas edits or Generate SQL. Follow-up free chat is next step.')
  }

  const onOptionPick = async (option) => {
    if (mode !== 'questions') return
    await handleAnswer(option)
  }

  const onSyncCanvas = () => {
    if (!editor || !schema) return
    const synced = parseSchemaFromCanvas(editor, schema)
    setSchema(synced)
    pushMessage('assistant', 'Canvas edits synced back into schema memory.')
  }

  const onGenerateSql = async () => {
    if (!schema) {
      pushMessage('assistant', 'Generate a schema first.')
      return
    }
    setLoading(true)
    try {
      const res = await api.generateSql(schema)
      setSql(res.sql)
      pushMessage('assistant', 'Postgres DDL generated successfully.')
    } catch (err) {
      pushMessage('assistant', `SQL generation failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen w-screen bg-slate-100">
      <div className="flex h-full w-full">
        <main className="h-full w-[70%] border-r border-slate-200 bg-white">
          <Tldraw
            onMount={(mountedEditor) => {
              setEditor(mountedEditor)
            }}
          />
        </main>

        <ChatPanel
          loading={loading}
          messages={messages}
          draft={draft}
          setDraft={setDraft}
          mode={mode}
          activeQuestion={activeQuestion}
          onSubmit={handleSubmit}
          onOptionPick={onOptionPick}
          onGenerateSql={onGenerateSql}
          onSyncCanvas={onSyncCanvas}
          sql={sql}
        />
      </div>
    </div>
  )
}
