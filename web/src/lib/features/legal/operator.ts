export const OPERATOR_NAME = 'xc4pr';
export const OPERATOR_EMAIL = '';
export const OPERATOR_ADDRESS = '';

export const CONTACT_URL = 'https://github.com/xc4pr/roomx/issues';
export const REPOSITORY_URL = 'https://github.com/xc4pr/roomx';
export const PUBLIC_URL = 'https://xc4pr.github.io/roomx/';

export function displayUrl(url: string): string {
	return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
