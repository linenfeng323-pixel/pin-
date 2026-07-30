/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"PingFang SC"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        mac: {
          windowBg: 'rgba(245, 245, 247, 0.85)',
          sidebarBg: 'rgba(236, 236, 238, 0.9)',
          accent: '#007AFF',
          accentHover: '#0066DD',
          success: '#34C759',
          warning: '#FF9500',
          danger: '#FF3B30',
          textPrimary: '#1D1D1F',
          textSecondary: '#6E6E73',
          border: 'rgba(0, 0, 0, 0.08)',
        },
      },
      borderRadius: {
        'mac': '12px',
        'mac-lg': '16px',
        'mac-xl': '20px',
      },
      boxShadow: {
        'mac': '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
        'mac-lg': '0 20px 60px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)',
      },
      backdropBlur: {
        'mac': '24px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        'pop-in': 'popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
