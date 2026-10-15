import { isIosSafari, readEnvironment } from './install.ts';

interface InstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const installState = $state({
	canPrompt: false,
	standalone: false,
	iosSafari: false
});

let deferred: InstallPromptEvent | null = null;

export function watchInstall(): () => void {
	if (typeof window === 'undefined') return () => {};
	const env = readEnvironment();
	installState.standalone = env.standalone;
	installState.iosSafari = isIosSafari(env);
	const onPrompt = (event: Event) => {
		event.preventDefault();
		deferred = event as InstallPromptEvent;
		installState.canPrompt = true;
	};
	const onInstalled = () => {
		deferred = null;
		installState.canPrompt = false;
		installState.standalone = true;
	};
	window.addEventListener('beforeinstallprompt', onPrompt);
	window.addEventListener('appinstalled', onInstalled);
	return () => {
		window.removeEventListener('beforeinstallprompt', onPrompt);
		window.removeEventListener('appinstalled', onInstalled);
	};
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
	const event = deferred;
	if (!event) return 'unavailable';
	deferred = null;
	installState.canPrompt = false;
	try {
		await event.prompt();
		const choice = await event.userChoice;
		return choice.outcome;
	} catch {
		return 'unavailable';
	}
}
