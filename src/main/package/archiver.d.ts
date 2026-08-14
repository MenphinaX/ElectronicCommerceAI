// archiver v7 函数式 API 最小声明（本项目固定 archiver@^7 + archiver-zip-encrypted 插件）
declare module 'archiver' {
  import type { Writable } from 'node:stream'
  interface ArchiverStream extends Writable {
    append(source: string | Buffer | NodeJS.ReadableStream, opts?: { name?: string }): this
    file(filePath: string, opts?: { name?: string }): this
    directory(dirPath: string, destPath?: string | false): this
    finalize(): Promise<void>
  }
  function archiver(format: string, options?: Record<string, unknown>): ArchiverStream
  namespace archiver {
    function create(format: string, options?: Record<string, unknown>): ArchiverStream
    function registerFormat(format: string, module: unknown): void
  }
  export = archiver
}