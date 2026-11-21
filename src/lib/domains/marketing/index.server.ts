/**
 * marketing — public server interface: services and http handlers.
 * Doc: ./README.md#public-interface
 */
export { sendContactMessage } from './marketing.service.server';
export {
	androidPageLoad,
	contactEndpoint,
	contactFormAction,
	marketingLayoutLoad,
	strayRootPostAction
} from './marketing.http.server';
