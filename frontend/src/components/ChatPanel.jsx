export default function ChatPanel({
  loading,
  messages,
  draft,
  setDraft,
  mode,
  activeQuestion,
  onSubmit,
  onOptionPick,
  onGenerateSql,
  onSyncCanvas,
  sql
}) {
  const inputPlaceholder =
    mode === 'prompt'
      ? 'Describe your business idea in plain English...'
      : activeQuestion
        ? 'Type your answer...'
        : 'Ask for changes or type a follow-up...'

  return (
    <aside className="flex h-full w-[30%] min-w-[360px] flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h1 className="text-lg font-semibold text-slate-900">DB Canvas Agent</h1>
        <p className="mt-1 text-xs text-slate-500">Chat-first flow with live editable schema canvas.</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[92%] rounded-lg p-3 text-sm ${m.role === 'user' ? 'ml-auto bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
            {m.content}
          </div>
        ))}

        {activeQuestion && (
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
            <p className="font-medium">Current question</p>
            <p className="mt-1">{activeQuestion.question}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(activeQuestion.options || []).map((op) => (
                <button
                  key={op}
                  onClick={() => onOptionPick(op)}
                  className="rounded-full border border-cyan-300 bg-white px-3 py-1 text-xs hover:bg-cyan-100"
                >
                  {op}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg bg-[#0b1220] p-3 text-xs text-slate-100">
          <p className="mb-1 font-medium text-cyan-200">Postgres SQL</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{sql || '-- SQL will appear after generation'}</pre>
        </div>
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex gap-2">
          <button onClick={onSyncCanvas} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
            Sync canvas edits
          </button>
          <button onClick={onGenerateSql} className="rounded-md bg-orange-500 px-2 py-1 text-xs font-medium text-white hover:bg-orange-600">
            Generate SQL
          </button>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <input
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
            placeholder={inputPlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !draft.trim()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </aside>
  )
}
