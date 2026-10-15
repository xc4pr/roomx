<script lang="ts">
	import { encode } from 'uqr';
	import { qrPath } from './qr.ts';

	let {
		text,
		label,
		class: className = ''
	}: { text: string; label: string; class?: string } = $props();

	const qr = $derived(encode(text, { ecc: 'L', boostEcc: true, border: 2 }));
	const path = $derived(qrPath(qr.data));
</script>

<svg
	viewBox="0 0 {qr.size} {qr.size}"
	role="img"
	aria-label={label}
	shape-rendering="crispEdges"
	class="block aspect-square w-full max-w-90 rounded-md bg-white {className}"
	data-testid="mirror-qr"
>
	<rect width={qr.size} height={qr.size} fill="#fff" />
	<path d={path} fill="#000" />
</svg>
