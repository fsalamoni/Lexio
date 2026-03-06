import axios from 'axios'
import { installDemoInterceptor } from '../demo/interceptor'

const api = axios.create({
  baseURL: '/api/v1',
})

// Demo mode interceptor (must be first — before auth header)
installDemoInterceptor(api)

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lexio_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('lexio_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
