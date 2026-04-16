// Error tracking and monitoring utilities
class ErrorTracker {
  constructor() {
    this.errors = []
    this.maxErrors = 100
  }

  // Log an error with context
  log(error, context = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error: error.message || String(error),
      stack: error.stack,
      context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      url: typeof window !== 'undefined' ? window.location.href : 'server'
    }

    this.errors.push(errorEntry)

    // Keep only the most recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors)
    }

    // In development, log to console
    if (import.meta.env.DEV) {
      console.error('[ErrorTracker]', errorEntry)
    }

    // TODO: Send to external monitoring service (Sentry, LogRocket, etc.)
    // this.sendToMonitoringService(errorEntry)
  }

  // Get recent errors
  getRecentErrors(limit = 10) {
    return this.errors.slice(-limit)
  }

  // Send error to external monitoring (placeholder for future implementation)
  sendToMonitoringService() {
    // Placeholder for services like Sentry, LogRocket, etc.
    // Example: Sentry.captureException(error, { extra: context })
  }
}

// Global error tracker instance
export const errorTracker = new ErrorTracker()

// Helper function to log errors with context
export function logError(error, context = {}) {
  errorTracker.log(error, context)
}

// Global error handler for unhandled errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    logError(event.error, {
      type: 'unhandled_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, {
      type: 'unhandled_promise_rejection'
    })
  })
}