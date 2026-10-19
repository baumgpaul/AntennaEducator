/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_PREPROCESSOR_URL: string
  readonly VITE_SOLVER_URL: string
  readonly VITE_POSTPROCESSOR_URL: string
  readonly VITE_API_BEHIND_CLOUDFRONT?: string
  /** "true" when the backend runs solves as queued jobs (terraform async_jobs = "lambda") */
  readonly VITE_ASYNC_JOBS?: string
  /** "true" to build FEM Studio (terraform enable_fem); off: not in the bundle */
  readonly VITE_FEATURE_FEM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
