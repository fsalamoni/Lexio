import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
})

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
    if (error.response?.status === 429) {
      window.dispatchEvent(new CustomEvent('lexio:rate-limit'))
    }
    return Promise.reject(error)
  }
)

export default api
