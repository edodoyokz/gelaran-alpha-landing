// Shared validation utilities for both client and server

export function validateEventSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    throw new Error('Schema harus berupa objek.')
  }

  const requiredFields = ['eventName', 'tagline', 'description', 'location', 'date', 'poster', 'fields']
  for (const field of requiredFields) {
    if (!(field in schema)) {
      throw new Error(`Field ${field} wajib ada dalam schema.`)
    }
  }

  // Validate event metadata
  const stringFields = ['eventName', 'tagline', 'description', 'location', 'date', 'poster']
  for (const field of stringFields) {
    if (typeof schema[field] !== 'string') {
      throw new Error(`Field ${field} harus berupa string.`)
    }
  }

  // Validate fields array
  if (!Array.isArray(schema.fields)) {
    throw new Error('Field fields harus berupa array.')
  }

  const fieldIds = new Set()
  for (let i = 0; i < schema.fields.length; i++) {
    const field = schema.fields[i]
    if (!field || typeof field !== 'object') {
      throw new Error(`Field pada index ${i} tidak valid.`)
    }

    const requiredFieldProps = ['id', 'label', 'type', 'required', 'placeholder', 'options']
    for (const prop of requiredFieldProps) {
      if (!(prop in field)) {
        throw new Error(`Field pada index ${i} kehilangan property ${prop}.`)
      }
    }

    // Check for duplicate IDs
    if (fieldIds.has(field.id)) {
      throw new Error(`Field ID '${field.id}' duplikat.`)
    }
    fieldIds.add(field.id)

    // Validate field types
    const validTypes = ['text', 'email', 'tel', 'number', 'select', 'textarea', 'date', 'checkbox']
    if (!validTypes.includes(field.type)) {
      throw new Error(`Tipe field '${field.type}' tidak valid.`)
    }

    if (typeof field.required !== 'boolean') {
      throw new Error(`Field required harus berupa boolean.`)
    }
  }

  return true
}

export function validateSubmission(submission) {
  if (!submission || typeof submission !== 'object') {
    throw new Error('Request body harus berupa objek.')
  }

  if (!Array.isArray(submission.answers)) {
    throw new Error('Field answers harus berupa array.')
  }

  // Validate each answer
  for (let i = 0; i < submission.answers.length; i++) {
    const answer = submission.answers[i]
    if (!answer || typeof answer !== 'object') {
      throw new Error(`Answer pada index ${i} tidak valid.`)
    }
    if (!answer.label || typeof answer.label !== 'string') {
      throw new Error(`Label pada answer index ${i} tidak valid.`)
    }
    if (answer.value !== undefined && typeof answer.value !== 'string' && typeof answer.value !== 'boolean') {
      throw new Error(`Value pada answer index ${i} harus string atau boolean.`)
    }
  }

  return true
}