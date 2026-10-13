<script lang="ts">
	import { resolve } from '$app/paths';
	import { messages } from '#lib/features/projects/i18n.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 px-6 pb-safe text-center">
	<div class="max-w-sm">
		<h1 class="text-2xl font-extrabold tracking-tight">{t(messages, 'errorTitle')}</h1>
		<p class="mt-2 text-base text-muted">{t(messages, 'errorText')}</p>
	</div>
	<div class="flex flex-wrap justify-center gap-3">
		<Button variant="secondary" onclick={() => location.reload()}>
			{t(messages, 'errorReload')}
		</Button>
		<Button variant="primary" href={resolve('/')}>{t(messages, 'errorHome')}</Button>
	</div>
</div>
