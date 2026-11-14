import { openRecovery } from './services/error/error-recovery'

// Deliberately ignore native payloads: they can contain queries, locations and credentials.
// Keep App independent of route/data modules so their startup errors reach these hooks.
App({
  onError() { openRecovery('runtime') },
  onUnhandledRejection() { openRecovery('promise') },
  onPageNotFound() { openRecovery('page-not-found') },
})

