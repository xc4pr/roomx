export const OPERATOR_NAME = 'xc4pr';
export const OPERATOR_EMAIL = 'julian-5@gmx.ch';
export const OPERATOR_ADDRESS = '';

export const CONTACT_URL = 'https://github.com/xc4pr/roomx/issues';
export const REPOSITORY_URL = 'https://github.com/xc4pr/roomx';
export const LICENSE_URL = `${REPOSITORY_URL}/blob/main/LICENSE`;
export const PUBLIC_URL = 'https://xc4pr.github.io/roomx/';

export function displayUrl(url: string): string {
	return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export const COPYRIGHT_YEAR = 2026;
