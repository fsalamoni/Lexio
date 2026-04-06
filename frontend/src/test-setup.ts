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
