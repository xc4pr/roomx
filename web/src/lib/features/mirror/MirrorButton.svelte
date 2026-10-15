<script lang="ts">
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import { t } from '#lib/i18n/index.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import { messages } from './i18n.ts';
	import MirrorDialog from './MirrorDialog.svelte';

	interface Props {
		roomIds: string[];
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	}

	let { roomIds, variant = 'secondary', size = 'md', class: className = '' }: Props = $props();

	let open = $state(false);
</script>

<Button
	{variant}
	{size}
	icon={Smartphone}
	class={className}
	onclick={() => (open = true)}
	data-testid="mirror-open"
>
	{t(messages, 'open')}
</Button>
<MirrorDialog bind:open {roomIds} />
