import type { HearthApi } from './index'

declare global {
  interface Window {
    hearth: HearthApi
  }
}

export {}
