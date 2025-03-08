export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	plugins: [require('tailwind-extended-shadows')],

	theme: {
		extend: {
			colors: {
				primary: {
					50: '#edefff',
					100: '#dee2ff',
					200: '#c4caff',
					300: '#a0a7ff',
					400: '#7c7aff',
					500: '#695bf9',
					600: '#5a3cef',
					700: '#4e2fd3',
					800: '#3a269d',
					DEFAULT: '#4e2fd3',
					900: '#362986',
					950: '#21184e'
				},
				secondary: {
					50: '#fff0f1',
					100: '#ffe3e4',
					200: '#ffcbd0',
					300: '#ffa0aa',
					400: '#ff6b7e',
					500: '#fc3754',
					DEFAULT: '#e9153e',
					600: '#e9153e',
					700: '#c50b34',
					800: '#a60c33',
					900: '#8d0e32',
					950: '#4f0216'
				}
			}
		}
	}
};
