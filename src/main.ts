import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { MotionPlugin } from '@vueuse/motion'
import { createApp } from 'vue'

import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './assets/main.css'

import App from './App.vue'
import router from './router/index.ts'

const app = createApp(App)

app.use(router)
app.use(autoAnimatePlugin)
app.use(MotionPlugin)

app.mount('#app')
