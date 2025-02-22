export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],

  theme: {
    extend: {
      colors: {
        primary: {
          '50': '#fef2f2',
          '100': '#fde3e4',
          '200': '#fdcbcd',
          '300': '#faa7aa',
          '400': '#f57478',
          '500': '#eb484d',
          '600': '#d82a30',
          '700': '#b72025',
          DEFAULT: '#b72025',
          '800': '#961e22',
          '900': '#7d1f22',
          '950': '#440b0d'
        },
        secondary: {
          DEFAULT: '#0a254e',
          '50': '#ecf9ff',
          '100': '#d5f0ff',
          '200': '#b4e7ff',
          '300': '#80d9ff',
          '400': '#45c1ff',
          '500': '#1aa0ff',
          '600': '#0280ff',
          '700': '#0068f9',
          '800': '#0453c9',
          '900': '#0b499d',
          '950': '#0a254e',
        },
      }
    }
  },
}
