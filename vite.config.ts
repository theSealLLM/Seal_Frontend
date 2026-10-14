/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Seal_LLM API (CORS 설정이 없어 개발 중에는 프록시로 우회)
// Windows에서 localhost는 IPv6를 먼저 시도해 요청마다 약 2초 늦으므로 127.0.0.1로 지정한다.
const API_TARGET = 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': API_TARGET,
      '/health': API_TARGET,
    },
  },
  test: {
    // API 계층 테스트는 Node 내장 fetch · ReadableStream으로 충분하다 (화면 테스트는 3단계에서 jsdom 추가)
    environment: 'node',
  },
})
