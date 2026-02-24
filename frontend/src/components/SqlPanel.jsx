export default function SqlPanel({ sql }) {
  return (
    <div className="h-[230px] border-t border-slate-200 bg-[#0f172a] p-3 text-xs text-slate-100">
      <p className="mb-2 text-sm font-medium text-cyan-200">Generated Postgres DDL</p>
      <pre className="h-[180px] overflow-auto rounded bg-[#020617] p-2">{sql || '-- SQL will appear here'}</pre>
    </div>
  )
}
