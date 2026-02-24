import { createShapeId } from '@tldraw/tldraw'

function tableText(table) {
  const lines = [table.name.toUpperCase()]
  for (const field of table.fields || []) {
    const tags = []
    if (field.primary_key) tags.push('PK')
    if (field.unique) tags.push('UQ')
    if (!field.nullable) tags.push('NN')
    const tagText = tags.length ? ` [${tags.join(',')}]` : ''
    lines.push(`${field.name}: ${field.type}${tagText}`)
  }
  return lines.join('\n')
}

function tableHeight(fieldsCount) {
  return Math.max(140, 50 + fieldsCount * 22)
}

function clearGenerated(editor) {
  const ids = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.meta?.schemaGenerated)
    .map((shape) => shape.id)

  if (ids.length) {
    editor.deleteShapes(ids)
  }
}

export function renderSchemaToCanvas(editor, schema) {
  if (!editor) return

  clearGenerated(editor)
  if (!schema || !(schema.tables || []).length) return

  const spacingX = 420
  const spacingY = 260
  const colCount = Math.max(1, Math.ceil(Math.sqrt(schema.tables.length)))
  const tableMeta = new Map()

  const tableShapes = (schema.tables || []).map((table, index) => {
    const col = index % colCount
    const row = Math.floor(index / colCount)
    const x = 70 + col * spacingX
    const y = 70 + row * spacingY
    const h = tableHeight((table.fields || []).length)

    tableMeta.set(table.name, { x, y, h })

    return {
      id: createShapeId(),
      type: 'geo',
      x,
      y,
      meta: { schemaGenerated: true, tableName: table.name },
      props: {
        geo: 'rectangle',
        w: 340,
        h,
        text: tableText(table),
        color: 'blue',
        fill: 'semi',
        size: 'm'
      }
    }
  })

  if (tableShapes.length) {
    editor.createShapes(tableShapes)
  }

  const relShapes = (schema.relationships || [])
    .map((rel) => {
      const from = tableMeta.get(rel.from_table)
      const to = tableMeta.get(rel.to_table)
      if (!from || !to) return null

      return {
        id: createShapeId(),
        type: 'arrow',
        x: 0,
        y: 0,
        meta: { schemaGenerated: true, relation: true },
        props: {
          start: { x: from.x + 340, y: from.y + from.h / 2 },
          end: { x: to.x, y: to.y + to.h / 2 },
          bend: 0,
          color: 'green',
          text: `${rel.from_table}.${rel.from_field} -> ${rel.to_table}.${rel.to_field}`
        }
      }
    })
    .filter(Boolean)

  if (relShapes.length) {
    editor.createShapes(relShapes)
  }

  editor.zoomToFit({ animation: { duration: 250 } })
}

export function parseSchemaFromCanvas(editor, currentSchema) {
  const tableShapes = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === 'geo' && typeof shape.props?.text === 'string')

  if (!tableShapes.length) return currentSchema

  const tables = tableShapes
    .map((shape) => {
      const lines = shape.props.text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      if (lines.length < 1) return null

      const name = lines[0].toLowerCase()
      const fields = lines.slice(1).map((line) => {
        const [left, metaRaw] = line.split('[')
        const [fieldNameRaw, fieldTypeRaw] = left.split(':')
        const fieldName = (fieldNameRaw || '').trim().toLowerCase() || 'unknown_field'
        const fieldType = (fieldTypeRaw || 'text').trim().toLowerCase()
        const meta = (metaRaw || '').toUpperCase()

        return {
          name: fieldName,
          type: fieldType,
          primary_key: meta.includes('PK'),
          unique: meta.includes('UQ'),
          nullable: !meta.includes('NN')
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
