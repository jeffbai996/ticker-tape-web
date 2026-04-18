import './styles/main.css'
import { initShell } from './layout/shell.js'
import { initRouter } from './router.js'
import { maybeShowOnboarding } from './layout/onboarding.js'

const app = document.getElementById('app')
initShell(app)
initRouter()
maybeShowOnboarding()
