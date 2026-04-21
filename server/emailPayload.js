/**
 * Builds a flat email submission data object from a submission that may have answers array.
 * This ensures email service functions receive consistent flat data structure.
 * 
 * @param {Object} submission - Submission object from storage (may have answers array)
 * @returns {Object} Flat object with email, full-name, phone, etc. extracted from answers
 */
export function buildEmailSubmissionData(submission) {
  if (!submission) {
    return {}
  }

  // Start with all existing properties
  const result = { ...submission }

  // If submission has answers array, extract fields as flat properties
  if (Array.isArray(submission.answers)) {
    for (const answer of submission.answers) {
      // Only set if not already present (preserve existing flat fields)
      if (answer.id && answer.value !== undefined && result[answer.id] === undefined) {
        result[answer.id] = answer.value
      }
    }
  }

  return result
}
