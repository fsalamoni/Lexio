/**
 * Vitest global setup — runs before any test file is loaded.
 *
 * Polyfills modern JS APIs that may be absent in the Node.js version
 * used by the test runner (pdfjs-dist requires Promise.withResolvers,
 * available from Node 22).
 */

// Polyfill Promise.withResolvers (Node < 22 / older environments)
if (!('withResolvers' in Promise)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      }),
    })
  }

  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserver {
      disconnect() {
        return undefined
      }

      observe() {
        return undefined
      }

      unobserve() {
        return undefined
      }
    }

    globalThis.ResizeObserver = ResizeObserver as unknown as typeof globalThis.ResizeObserver
  }

  if (!('IntersectionObserver' in globalThis)) {
    class IntersectionObserver {
      root = null

      rootMargin = ''

      thresholds: number[] = []

      disconnect() {
        return undefined
      }

      observe() {
        return undefined
      }

      takeRecords() {
        return []
      }

      unobserve() {
        return undefined
      }
    }

    globalThis.IntersectionObserver = IntersectionObserver as unknown as typeof globalThis.IntersectionObserver
  }

  if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
      return undefined
    }
  }
}

