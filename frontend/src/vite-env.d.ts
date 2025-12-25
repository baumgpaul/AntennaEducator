/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_PREPROCESSOR_URL: string
  readonly VITE_SOLVER_URL: string
  readonly VITE_POSTPROCESSOR_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}