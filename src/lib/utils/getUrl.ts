import { NODE_ENV } from '$env/static/private';

export const getUrl = () => {
	let url = 'https://familyplanz.com';
	if (NODE_ENV === 'development') {
		url = 'https://localhost:5173';
	} else if (NODE_ENV === 'test') {
		url = 'https://test.familyplanz.com';
	}
	return url;
};
