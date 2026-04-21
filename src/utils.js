// Toast notifications
export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');

  const bgColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500'
  };

  toast.className = `${bgColors[type]} text-white px-4 py-2 rounded-lg shadow-lg transform transition-all duration-300 opacity-0 translate-y-2`;
  toast.textContent = message;

  container.appendChild(toast);

  // Animate in
  setTimeout(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  }, 10);

  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 3000);
}

// API rate limiter - limits requests to 1 per 200ms to avoid Amap rate limits
export class RateLimiter {
  constructor(limitInterval = 200) {
    this.limitInterval = limitInterval;
    this.lastRequestTime = 0;
    this.queue = [];
  }

  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.queue.length === 0) return;

    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;

    if (timeSinceLast >= this.limitInterval) {
      const { fn, resolve, reject } = this.queue.shift();
      this.lastRequestTime = Date.now();

      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // Process next in queue
      setTimeout(() => this.processQueue(), this.limitInterval);
    } else {
      // Wait until interval passes
      setTimeout(() => this.processQueue(), this.limitInterval - timeSinceLast);
    }
  }
}

// Format distance (meters to km/meters readable string)
export function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

// Format duration (seconds to hours/minutes readable string)
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

// Amap API key configuration
export const AMAP_API_KEY = 'YOUR_AMAP_API_KEY'; // User will replace this
