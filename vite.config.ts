import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { researchHandler } from './server/research.ts'
import { accessHandler } from './server/research-access.ts'

export default defineConfig(({ mode }) => {
  const keys = [
    'REPAIR_AI_API_KEY',
    'OPENAI_API_KEY',
    'REPAIR_AI_MODEL',
    'REPAIR_AI_PROVIDER',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'GROQ_API_KEY',
    'GROQ_MODEL',
    'TAVILY_API_KEY',
    'DAILY_QUOTA_ENABLED',
    'DAILY_AI_LIMIT',
    'DAILY_QUOTA_NAMESPACE',
    'AUTH0_DOMAIN',
    'AUTH0_CLIENT_ID',
    'AUTH0_AUDIENCE',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ]
  const localEnv = loadEnv(mode, process.cwd(), keys)
  for (const key of keys) {
    if (!process.env[key] && localEnv[key]) process.env[key] = localEnv[key]
  }
  return {
    plugins: [
      react(),
      {
        name: 'second-life-research-api',
        configureServer(server) {
          server.middlewares.use('/api/access', accessHandler)
          server.middlewares.use('/api/research', researchHandler)
        },
        configurePreviewServer(server) {
          server.middlewares.use('/api/access', accessHandler)
          server.middlewares.use('/api/research', researchHandler)
        },
      },
    ],
    test: {
      include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    },
  }
})
