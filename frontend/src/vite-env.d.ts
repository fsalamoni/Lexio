/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_REDESIGN_V2?: string
	readonly VITE_REDESIGN_V2_HOME?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
