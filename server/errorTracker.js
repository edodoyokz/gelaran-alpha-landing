// Server-side error tracking and monitoring utilities
class ServerErrorTracker {
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
      nodeVersion: process.version,
      platform: process.platform,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    }

    this.errors.push(errorEntry)

    // Keep only the most recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors)
    }

    // Always log to console with structured format
    console.error('[ServerErrorTracker]', JSON.stringify(errorEntry, null, 2))

    // TODO: Send to external monitoring service (Sentry, LogRocket, etc.)
    // this.sendToMonitoringService(errorEntry)
  }

  // Get recent errors
  getRecentErrors(limit = 10) {
    return this.errors.slice(-limit)
  }

  // Send error to external monitoring (placeholder for future implementation)
  sendToMonitoringService() {
    // Placeholder for services like Sentry, DataDog, etc.
    // Example: Sentry.captureException(error, { extra: context })
  }
}

// Global server error tracker instance
export const serverErrorTracker = new ServerErrorTracker()

// Helper function to log server errors with context
export function logServerError(error, context = {}) {
  serverErrorTracker.log(error, context)
}

// Global error handler for unhandled server errors
process.on('uncaughtException', (error) => {
  logServerError(error, { type: 'uncaught_exception' })
  // In production, you might want to exit the process
  // process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logServerError(reason, {
    type: 'unhandled_promise_rejection',
    promise: String(promise)
  })
})