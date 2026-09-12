import type { DaProdApi } from './index'

declare global {
  interface Window {
    daprod: DaProdApi
  }
}

export {}
