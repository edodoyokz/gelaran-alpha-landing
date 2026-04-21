/**
 * Submission search and filter helpers for admin dashboard
 * Provides smart search, filtering, and sorting capabilities
 */

/**
 * Normalize phone number for search matching
 * Removes spaces, dashes, parentheses, and plus signs
 */
export function normalizePhone(phone) {
  if (!phone) return ''
  return String(phone).replace(/[\s\-()+]/g, '').toLowerCase()
}

/**
 * Normalize search term for matching
 * Converts to lowercase and trims whitespace
 */
export function normalizeSearchTerm(term) {
  if (!term) return ''
  return String(term).toLowerCase().trim()
}

/**
 * Tokenize search query into individual words
 * Splits by whitespace and filters empty strings
 */
export function tokenizeSearchQuery(query) {
  if (!query) return []
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 0)
}

/**
 * Extract searchable data from submission
 * Returns normalized text and phone for efficient searching
 */
export function getSubmissionSearchIndex(submission) {
  const answers = submission.answers || []
  
  // Find priority fields
  const nameAnswer = answers.find(a => 
    a.label && (
      a.label.toLowerCase().includes('nama') ||
      a.label.toLowerCase().includes('name')
    )
  )
  
  const emailAnswer = answers.find(a => 
    a.label && a.label.toLowerCase().includes('email')
  )
  
  const phoneAnswer = answers.find(a => 
    a.label && (
      a.label.toLowerCase().includes('whatsapp') ||
      a.label.toLowerCase().includes('phone') ||
      a.label.toLowerCase().includes('nomor')
    )
  )
  
  // Build searchable text from all answers
  const allText = answers
    .map(a => `${a.label} ${a.value}`)
    .join(' ')
    .toLowerCase()
  
  return {
    text: allText,
    name: nameAnswer ? normalizeSearchTerm(nameAnswer.value) : '',
    email: emailAnswer ? normalizeSearchTerm(emailAnswer.value) : '',
    phone: phoneAnswer ? String(phoneAnswer.value) : '',
    phoneNormalized: phoneAnswer ? normalizePhone(phoneAnswer.value) : '',
  }
}

/**
 * Check if submission matches search query
 * Uses tokenized search with AND logic (all tokens must match)
 * Supports phone number normalization for flexible matching
 */
export function matchesSubmissionQuery(submission, query) {
  if (!query || query.trim().length === 0) return true
  
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return true
  
  const index = getSubmissionSearchIndex(submission)
  
  // All tokens must match (AND logic)
  return tokens.every(token => {
    // Check if token matches normalized phone
    const normalizedToken = normalizePhone(token)
    if (normalizedToken.length > 0 && index.phoneNormalized.includes(normalizedToken)) {
      return true
    }
    
    // Check if token matches any text field
    return index.text.includes(token)
  })
}

/**
 * Check if submission matches filter criteria
 */
export function matchesSubmissionFilter(submission, filterValue, now = new Date()) {
  const todayIso = now.toISOString().slice(0, 10)
  const submittedDate = submission.submittedAtIso ? new Date(submission.submittedAtIso) : null
  
  switch (filterValue) {
    case 'all':
      return true
      
    case 'today':
      return String(submission.submittedAtIso || '').startsWith(todayIso)
      
    case 'thisWeek': {
      if (!submittedDate) return false
      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)
      return submittedDate >= weekAgo
    }
    
    case 'thisMonth': {
      if (!submittedDate) return false
      const monthAgo = new Date(now)
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      return submittedDate >= monthAgo
    }
    
    case 'withEmail':
      return submission.answers.some(a => 
        a.label && a.label.toLowerCase().includes('email') && a.value
      )
      
    case 'withPhone':
      return submission.answers.some(a => 
        a.label && (
          a.label.toLowerCase().includes('whatsapp') ||
          a.label.toLowerCase().includes('phone') ||
          a.label.toLowerCase().includes('nomor')
        ) && a.value
      )
      
    case 'paid':
      return submission.paymentStatus === 'paid'
      
    case 'unpaid':
      return submission.paymentStatus !== 'paid'
      
    default:
      return true
  }
}

/**
 * Get submission timestamp value for sorting
 */
function getSubmissionTimeValue(submission) {
  return submission.submittedAtIso 
    ? new Date(submission.submittedAtIso).getTime() 
    : 0
}

/**
 * Get primary answer (usually name) for sorting
 */
function getPrimaryAnswer(submission) {
  const answers = submission.answers || []
  if (answers.length === 0) return ''
  
  // Try to find name field first
  const nameAnswer = answers.find(a => 
    a.label && (
      a.label.toLowerCase().includes('nama') ||
      a.label.toLowerCase().includes('name')
    )
  )
  
  if (nameAnswer) return String(nameAnswer.value || '')
  
  // Fallback to first answer
  return String(answers[0].value || '')
}

/**
 * Check if submission has email
 */
function hasEmail(submission) {
  return submission.answers.some(a => 
    a.label && a.label.toLowerCase().includes('email') && a.value
  )
}

/**
 * Check if submission has phone
 */
function hasPhone(submission) {
  return submission.answers.some(a => 
    a.label && (
      a.label.toLowerCase().includes('whatsapp') ||
      a.label.toLowerCase().includes('phone') ||
      a.label.toLowerCase().includes('nomor')
    ) && a.value
  )
}

/**
 * Compare two submissions for sorting
 */
export function compareSubmissions(left, right, sortValue) {
  switch (sortValue) {
    case 'newest':
      return getSubmissionTimeValue(right) - getSubmissionTimeValue(left)
      
    case 'oldest':
      return getSubmissionTimeValue(left) - getSubmissionTimeValue(right)
      
    case 'nameAsc':
      return getPrimaryAnswer(left).localeCompare(getPrimaryAnswer(right), 'id')
      
    case 'nameDesc':
      return getPrimaryAnswer(right).localeCompare(getPrimaryAnswer(left), 'id')
      
    case 'paidFirst': {
      const leftPaid = left.paymentStatus === 'paid' ? 1 : 0
      const rightPaid = right.paymentStatus === 'paid' ? 1 : 0
      if (leftPaid !== rightPaid) return rightPaid - leftPaid
      // Secondary sort by newest
      return getSubmissionTimeValue(right) - getSubmissionTimeValue(left)
    }
    
    case 'unpaidFirst': {
      const leftPaid = left.paymentStatus === 'paid' ? 1 : 0
      const rightPaid = right.paymentStatus === 'paid' ? 1 : 0
      if (leftPaid !== rightPaid) return leftPaid - rightPaid
      // Secondary sort by newest
      return getSubmissionTimeValue(right) - getSubmissionTimeValue(left)
    }
    
    case 'emailFirst': {
      const leftHasEmail = hasEmail(left) ? 1 : 0
      const rightHasEmail = hasEmail(right) ? 1 : 0
      if (leftHasEmail !== rightHasEmail) return rightHasEmail - leftHasEmail
      // Secondary sort by newest
      return getSubmissionTimeValue(right) - getSubmissionTimeValue(left)
    }
    
    case 'phoneFirst': {
      const leftHasPhone = hasPhone(left) ? 1 : 0
      const rightHasPhone = hasPhone(right) ? 1 : 0
      if (leftHasPhone !== rightHasPhone) return rightHasPhone - leftHasPhone
      // Secondary sort by newest
      return getSubmissionTimeValue(right) - getSubmissionTimeValue(left)
    }
    
    default:
      return getSubmissionTimeValue(right) - getSubmissionTimeValue(left)
  }
}
