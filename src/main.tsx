import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ResearchAccessProvider } from './components/ResearchAccess'
import '@fontsource-variable/dm-sans'
import '@fontsource/dm-serif-display/latin-400.css'
import '@fontsource/dm-serif-display/latin-400-italic.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ResearchAccessProvider>
      <App />
    </ResearchAccessProvider>
  </React.StrictMode>,
)
