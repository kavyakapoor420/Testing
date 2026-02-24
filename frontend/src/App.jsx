import { useEffect, useMemo, useState } from 'react'
import { Tldraw } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import ChatPanel from './components/ChatPanel'
import { api } from './lib/api'
import { parseSchemaFromCanvas, renderSchemaToCanvas } from './lib/canvasSchema'

function createChat(id) {
  return {
    id,
    title: `Chat ${id}`,
    mode: 'prompt',
    prompt: '',
    schema: null,
    questions: [],
    questionIndex: 0,
    answers: {},
    sql: '',
    messages: [
      {
        role: 'assistant',
        content:
          'Describe your business idea. I will generate a visual schema on canvas, then ask relevant questions one-by-one.'
      }
    ]
  }
}

export default function App() {
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState(null)
  const [draft, setDraft] = useState('')
  const [chats, setChats] = useState([createChat(1)])
  const [activeChatId, setActiveChatId] = useState(1)

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) || chats[0],
    [chats, activeChatId]
  )

  const updateActiveChat = (updater) => {
    setChats((prev) => prev.map((chat) => (chat.id === activeChatId ? updater(chat) : chat)))
  }

  const pushMessage = (role, content) => {
    updateActiveChat((chat) => ({ ...chat, messages: [...chat.messages, { role, content }] }))
  }

  useEffect(() => {
    if (!editor) return
    renderSchemaToCanvas(editor, activeChat?.schema)
  }, [activeChatId, activeChat?.schema, editor])

  const askQuestionMessage = (index, questions) => {
    const question = questions[index]
    if (!question) {
      pushMessage('assistant', 'Done with questions. You can keep chatting for refinements or generate SQL now.')
      updateActiveChat((chat) => ({ ...chat, mode: 'ready' }))
      return
    }
    pushMessage('assistant', `Question ${index + 1}/${questions.length}: ${question.question}`)
  }

  const startSchemaFlow = async (text) => {
    setLoading(true)
    pushMessage('user', text)
    try {
      const res = await api.generateInitial(text)
      updateActiveChat((chat) => ({
        ...chat,
        prompt: text,
        schema: res.schema,
        questions: res.questions || [],
        questionIndex: 0,
        answers: {},
        sql: '',
        mode: (res.questions || []).length ? 'questions' : 'ready'
      }))
      pushMessage('assistant', 'Initial draft created and drawn on canvas.')
      askQuestionMessage(0, res.questions || [])
    } catch (err) {
      pushMessage('assistant', `Failed to generate schema: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const answerQuestion = async (answerText) => {
    const question = (activeChat.questions || [])[activeChat.questionIndex]
    if (!question) return

    const nextAnswers = { ...activeChat.answers, [question.id]: answerText }
    const nextIndex = activeChat.questionIndex + 1

    pushMessage('user', answerText)
    updateActiveChat((chat) => ({
      ...chat,
      answers: nextAnswers,
      questionIndex: nextIndex
    }))

    if (nextIndex < activeChat.questions.length) {
      askQuestionMessage(nextIndex, activeChat.questions)
      return
    }

    setLoading(true)
    try {
      const res = await api.refine({
        prompt: activeChat.prompt,
        schema: activeChat.schema,
        answers: nextAnswers
      })
      updateActiveChat((chat) => ({
        ...chat,
        schema: res.schema,
        mode: 'ready'
      }))
      pushMessage('assistant', 'Schema refined with your answers and updated on canvas.')
    } catch (err) {
      pushMessage('assistant', `Refine failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleFollowUp = async (text) => {
    if (!activeChat.schema) {
      pushMessage('assistant', 'Generate the first schema before follow-up changes.')
      return
    }
    pushMessage('user', text)
    setLoading(true)
    try {
      const res = await api.followUp({
        prompt: activeChat.prompt,
        schema: activeChat.schema,
        message: text
      })
      updateActiveChat((chat) => ({ ...chat, schema: res.schema }))
      pushMessage('assistant', 'Applied your follow-up request and refreshed the diagram.')
    } catch (err) {
      pushMessage('assistant', `Follow-up update failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    const text = draft.trim()
    if (!text || loading) return
    setDraft('')

    if (activeChat.mode === 'prompt') {
      await startSchemaFlow(text)
      return
    }

    if (activeChat.mode === 'questions') {
      await answerQuestion(text)
      return
    }

    await handleFollowUp(text)
  }

  const onOptionPick = async (option) => {
    if (activeChat.mode === 'questions') {
      await answerQuestion(option)
    }
  }

  const onSyncCanvas = () => {
    if (!editor || !activeChat?.schema) return
    const synced = parseSchemaFromCanvas(editor, activeChat.schema)
    updateActiveChat((chat) => ({ ...chat, schema: synced }))
    pushMessage('assistant', 'Synced manual canvas edits into schema memory.')
  }

  const onGenerateSql = async () => {
    if (!activeChat?.schema) {
      pushMessage('assistant', 'Generate schema first.')
      return
    }

    setLoading(true)
    try {
      const res = await api.generateSql(activeChat.schema)
      updateActiveChat((chat) => ({ ...chat, sql: res.sql }))
      pushMessage('assistant', 'SQL generated. Review it below and keep refining if needed.')
    } catch (err) {
      pushMessage('assistant', `SQL generation failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const onNewChat = () => {
    const nextId = chats.reduce((mx, c) => Math.max(mx, c.id), 0) + 1
    const next = createChat(nextId)
    setChats((prev) => [...prev, next])
    setActiveChatId(nextId)
    setDraft('')
  }

  return (
    <div className="h-screen w-screen bg-[#02050b] text-slate-100">
      <div className="flex h-full w-full">
        <main className="h-full w-[70%] border-r border-white/10 bg-white">
          <Tldraw
            onMount={(mountedEditor) => {
              setEditor(mountedEditor)
            }}
          />
        </main>

        <ChatPanel
          loading={loading}
          chats={chats}
          activeChatId={activeChatId}
          activeChat={activeChat}
          draft={draft}
          setDraft={setDraft}
          onSubmit={handleSubmit}
          onOptionPick={onOptionPick}
          onGenerateSql={onGenerateSql}
          onSyncCanvas={onSyncCanvas}
          onNewChat={onNewChat}
          onSelectChat={setActiveChatId}
        />
      </div>
    </div>
  )
}
