function SessionTabs({ chats, activeChatId, onSelectChat, onNewChat }) {
  return (
    <div className="border-b border-white/10 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-wide text-slate-100">DB Canvas Agent</h1>
        <button
          onClick={onNewChat}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
          title="New chat"
        >
          +
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => onSelectChat(chat.id)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              chat.id === activeChatId
                ? 'bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/50'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {chat.title}
          </button>
        ))}
      </div>
    </div>
  )
}

function Message({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
            : 'bg-white/8 text-slate-200 ring-1 ring-white/10'
        }`}
      >
        {content}
      </div>
    </div>
  )
}

function SqlCard({ sql }) {
  return (
    <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/5 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-200">Generated SQL</p>
      <pre className="max-h-52 overflow-auto rounded-lg bg-[#071118] p-2 text-xs text-slate-100">{sql || '-- SQL will appear here --'}</pre>
    </div>
  )
}

export default function ChatPanel({
  loading,
  chats,
  activeChatId,
  activeChat,
  draft,
  setDraft,
  onSubmit,
  onOptionPick,
  onGenerateSql,
  onSyncCanvas,
  onNewChat,
  onSelectChat
}) {
  const activeQuestion =
    activeChat?.mode === 'questions'
      ? (activeChat.questions || [])[activeChat.questionIndex] || null
      : null

  const inputPlaceholder =
    activeChat?.mode === 'prompt'
      ? 'Describe your product idea...'
      : activeQuestion
        ? 'Answer this question...'
        : 'Ask follow-up changes (e.g. add bookmarks table, add indexes)'

  return (
    <aside className="flex h-full w-[30%] min-w-[380px] flex-col bg-[#070b14]">
      <SessionTabs
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={onSelectChat}
        onNewChat={onNewChat}
      />

      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-[11px] text-slate-400">
        <span className="rounded-full bg-white/10 px-2 py-0.5">mode: {activeChat?.mode || 'prompt'}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5">continuous chat enabled</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {(activeChat?.messages || []).map((m, i) => (
          <Message key={i} role={m.role} content={m.content} />
        ))}

        {activeQuestion && (
          <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-xs text-cyan-100">
            <p className="font-medium">Question {activeChat.questionIndex + 1}/{activeChat.questions.length}</p>
            <p className="mt-1">{activeQuestion.question}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(activeQuestion.options || []).map((op) => (
                <button
                  key={op}
                  onClick={() => onOptionPick(op)}
                  className="rounded-full border border-cyan-300/40 px-2.5 py-1 hover:bg-cyan-300/20"
                >
                  {op}
                </button>
              ))}
            </div>
          </div>
        )}

        <SqlCard sql={activeChat?.sql || ''} />
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <div className="mb-2 flex gap-2">
          <button
            onClick={onSyncCanvas}
            className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
          >
            Sync canvas
          </button>
          <button
            onClick={onGenerateSql}
            className="rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
          >
            Generate SQL
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="flex items-center gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={inputPlaceholder}
            className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={loading || !draft.trim()}
            className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </aside>
  )
}
