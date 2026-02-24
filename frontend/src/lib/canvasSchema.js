import { createShapeId } from '@tldraw/tldraw'

function tableText(table) {
  const lines = [table.name]
  for (const field of table.fields || []) {
    const tags = []
    if (field.primary_key) tags.push('pk')
    if (field.unique) tags.push('uniq')
    if (!field.nullable) tags.push('not null')
    lines.push(`- ${field.name}: ${field.type}${tags.length ? ` [${tags.join(', ')}]` : ''}`)
  }
  return lines.join('\n')
}

export function renderSchemaToCanvas(editor, schema) {
  if (!editor || !schema) return

  const existingIds = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.meta?.schemaGenerated)
    .map((shape) => shape.id)

  if (existingIds.length) {
    editor.deleteShapes(existingIds)
  }

  const spacingX = 420
  const spacingY = 260
  const tablePos = new Map()

  const tableShapes = (schema.tables || []).map((table, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = 80 + col * spacingX
    const y = 80 + row * spacingY
    tablePos.set(table.name, { x, y })

    return {
      id: createShapeId(),
      type: 'geo',
      x,
      y,
      meta: { schemaGenerated: true, tableName: table.name },
      props: {
        geo: 'rectangle',
        w: 330,
        h: 190,
        text: tableText(table),
        fill: 'solid',
        color: 'blue',
        size: 'm',
        align: 'middle'
      }
    }
  })

  if (tableShapes.length) {
    editor.createShapes(tableShapes)
  }

  // Keep relation labels simple and robust for MVP instead of fragile arrow bindings.
  const relationNotes = (schema.relationships || []).map((rel, idx) => {
    const source = tablePos.get(rel.from_table)
    if (!source) return null

    return {
      id: createShapeId(),
      type: 'text',
      x: source.x + 8,
      y: source.y + 196 + idx * 18,
      meta: { schemaGenerated: true, relationshipNote: true },
      props: {
        text: `${rel.from_table}.${rel.from_field} -> ${rel.to_table}.${rel.to_field}`,
        size: 's',
        color: 'green',
        autoSize: true
      }
    }
  }).filter(Boolean)

  if (relationNotes.length) {
    editor.createShapes(relationNotes)
  }

  editor.zoomToFit({ animation: { duration: 250 } })
}

export function parseSchemaFromCanvas(editor, currentSchema) {
  const tableShapes = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === 'geo' && typeof s.props?.text === 'string')

  if (!tableShapes.length) return currentSchema

  const tables = tableShapes
    .map((shape) => {
      const lines = shape.props.text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      if (!lines.length) return null

      const name = lines[0]
      const fields = lines.slice(1).map((line) => {
        const clean = line.replace(/^-\s*/, '')
        const [left, metaRaw] = clean.split('[')
        const [fieldName, fieldType] = left.split(':').map((x) => x?.trim())
        const meta = (metaRaw || '').toLowerCase()

        return {
          name: fieldName || 'unknown_field',
          type: fieldType || 'text',
          primary_key: meta.includes('pk'),
          unique: meta.includes('uniq'),
          nullable: !meta.includes('not null')
        }
      })

      return {
        name,
        fields,
        notes: `Synced from canvas shape ${shape.id}`
      }
    })
    .filter(Boolean)

  return {
    ...currentSchema,
    tables
  }
}
