export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	plugins: [require('tailwind-extended-shadows')],

	theme: {
		extend: {
			colors: {
				primary: {
					50: '#fef7f0',
					100: '#fdede0',
					200: '#fad9bf',
					300: '#f5be92',
					400: '#ee9459',
					500: '#e87539',
					600: '#dd5822',
					700: '#b8441c',
					800: '#943a1e',
					900: '#793420',
					DEFAULT: '#dd5822',
					950: '#421a0c'
				},
				secondary: {
					50: '#f8fafc',
					100: '#f1f5f9',
					200: '#e2e8f0',
					300: '#cbd5e1',
					400: '#94a3b8',
					500: '#64748b',
					600: '#475569',
					700: '#334155',
					800: '#1e293b',
					900: '#0f172a',
					DEFAULT: '#334155'
				}
			}
		}
	}
};
