<script lang="ts">
	import type { TourStepId } from './steps.ts';

	let { id }: { id: TourStepId } = $props();
</script>

<svg viewBox="0 0 200 112" class="h-auto w-full" aria-hidden="true" focusable="false">
	{#if id === 'welcome'}
		<rect
			x="46"
			y="18"
			width="108"
			height="76"
			rx="5"
			class="fill-surface stroke-text stroke-[3]"
		/>
		<path d="M68 94 V68 A26 26 0 0 1 94 94" class="fill-none stroke-door stroke-2" />
		<rect x="112" y="15" width="30" height="6" rx="2" class="fill-window" />
		<rect x="58" y="30" width="46" height="22" rx="6" class="fill-item" />
		<rect x="114" y="46" width="28" height="18" rx="3" class="fill-item" />
		<path d="M172 16 l3.5 9 9 3.5 -9 3.5 -3.5 9 -3.5 -9 -9 -3.5 9 -3.5z" class="fill-accent" />
		<path
			d="M28 70 l2.2 5.5 5.5 2.2 -5.5 2.2 -2.2 5.5 -2.2 -5.5 -5.5 -2.2 5.5 -2.2z"
			class="fill-accent"
		/>
		<circle cx="176" cy="84" r="3" class="fill-electric" />
	{:else if id === 'projects'}
		<rect
			x="50"
			y="12"
			width="100"
			height="88"
			rx="10"
			class="fill-surface stroke-border stroke-2"
		/>
		<rect x="58" y="20" width="84" height="46" rx="6" class="fill-surface-2" />
		<rect x="76" y="31" width="48" height="26" rx="2" class="fill-surface stroke-accent stroke-2" />
		<rect x="58" y="74" width="48" height="7" rx="3.5" class="fill-text" />
		<rect x="58" y="86" width="32" height="5" rx="2.5" class="fill-muted opacity-50" />
		<circle cx="128" cy="31" r="10" class="fill-surface stroke-border stroke-[1.5]" />
		<circle cx="123.5" cy="31" r="1.6" class="fill-muted" />
		<circle cx="128" cy="31" r="1.6" class="fill-muted" />
		<circle cx="132.5" cy="31" r="1.6" class="fill-muted" />
		<circle cx="162" cy="84" r="15" class="fill-accent" />
		<path
			d="M162 76 V92 M154 84 H170"
			class="fill-none stroke-accent-contrast stroke-[3.5]"
			stroke-linecap="round"
		/>
	{:else if id === 'plan'}
		<path
			d="M20 26 H180 M20 56 H180 M20 86 H180 M52 8 V104 M104 8 V104 M156 8 V104"
			class="fill-none stroke-border stroke-1"
		/>
		<rect x="26" y="30" width="64" height="48" class="fill-surface stroke-text stroke-[2.5]" />
		<rect
			x="106"
			y="40"
			width="58"
			height="42"
			class="fill-accent-soft stroke-accent stroke-[2.5]"
		/>
		{#each [[106, 40], [164, 40], [164, 82], [106, 82]] as [x, y] (`${x}-${y}`)}
			<rect
				x={x - 4.5}
				y={y - 4.5}
				width="9"
				height="9"
				rx="2.5"
				class="fill-surface stroke-accent stroke-2"
			/>
		{/each}
		<path
			d="M142 56 V82 L148.5 76 L153 87 L158 85 L153.5 74.5 L162 74.5 Z"
			class="fill-text stroke-surface stroke-[1.5]"
			stroke-linejoin="round"
		/>
		<circle cx="176" cy="92" r="12" class="fill-accent" />
		<path
			d="M176 86 V98 M170 92 H182"
			class="fill-none stroke-accent-contrast stroke-[3]"
			stroke-linecap="round"
		/>
	{:else if id === 'dims'}
		<rect x="48" y="30" width="104" height="62" class="fill-surface stroke-text stroke-[3]" />
		<path d="M48 18 H152 M48 12 V24 M152 12 V24" class="fill-none stroke-accent stroke-2" />
		<rect x="80" y="8" width="40" height="12" rx="6" class="fill-accent" />
		<path d="M166 30 V92 M160 30 H172 M160 92 H172" class="fill-none stroke-accent stroke-2" />
		<rect x="160" y="50" width="12" height="22" rx="6" class="fill-accent" />
		{#each [[48, 30], [152, 30], [152, 92], [48, 92]] as [x, y] (`${x}-${y}`)}
			<circle cx={x} cy={y} r="6.5" class="fill-surface stroke-accent stroke-[2.5]" />
		{/each}
	{:else if id === 'elements'}
		<rect x="22" y="24" width="156" height="12" rx="2" class="fill-text opacity-80" />
		<rect x="46" y="21" width="46" height="18" rx="2" class="fill-window" />
		<rect x="114" y="21" width="30" height="18" class="fill-accent-soft" />
		<path d="M114 38 V66" class="fill-none stroke-door stroke-[3.5]" stroke-linecap="round" />
		<path
			d="M114 66 A28 28 0 0 0 142 38"
			class="fill-none stroke-door stroke-2"
			stroke-dasharray="4 3"
		/>
		<rect
			x="158"
			y="42"
			width="12"
			height="12"
			rx="2.5"
			class="fill-electric stroke-text stroke-[1.5]"
		/>
		<circle cx="162.5" cy="48" r="1.3" class="fill-text" />
		<circle cx="166" cy="48" r="1.3" class="fill-text" />
		{#each [{ x: 52, tone: 'fill-window' }, { x: 87, tone: 'fill-door' }, { x: 122, tone: 'fill-electric' }] as tile (tile.x)}
			<rect
				x={tile.x}
				y="74"
				width="30"
				height="28"
				rx="8"
				class="fill-surface stroke-border stroke-2"
			/>
			<rect x={tile.x + 8} y="81" width="14" height="14" rx="3" class={tile.tone} />
		{/each}
		<rect
			x="150"
			y="72"
			width="32"
			height="32"
			rx="16"
			class="fill-accent-soft stroke-accent stroke-2"
		/>
		<path
			d="M166 80 L156 90 H163 L162 98 L172 87 H165 Z"
			class="fill-accent"
			stroke-linejoin="round"
		/>
	{:else if id === 'photos'}
		<rect
			x="38"
			y="20"
			width="62"
			height="76"
			rx="6"
			transform="rotate(-8 69 58)"
			class="fill-surface stroke-border stroke-2"
		/>
		<rect
			x="100"
			y="22"
			width="62"
			height="76"
			rx="6"
			transform="rotate(7 131 60)"
			class="fill-surface stroke-border stroke-2"
		/>
		<rect
			x="62"
			y="30"
			width="76"
			height="56"
			rx="10"
			class="fill-surface stroke-text stroke-[3]"
		/>
		<rect x="86" y="24" width="28" height="9" rx="4" class="fill-text" />
		<circle cx="100" cy="58" r="17" class="fill-accent-soft stroke-accent stroke-[3]" />
		<circle cx="100" cy="58" r="7" class="fill-accent" />
		<circle cx="126" cy="42" r="3" class="fill-electric" />
		<path d="M30 52 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" class="fill-accent" />
	{:else if id === 'build'}
		<path
			d="M34 66 L100 36 L166 66 L100 96 Z"
			class="fill-surface stroke-text stroke-[2.5]"
			stroke-linejoin="round"
		/>
		<path
			d="M34 66 L100 36 V6 L34 36 Z"
			class="fill-accent-soft stroke-text stroke-[2.5]"
			stroke-linejoin="round"
		/>
		<path
			d="M100 36 L166 66 V36 L100 6 Z"
			class="fill-surface-2 stroke-text stroke-[2.5]"
			stroke-linejoin="round"
		/>
		<path d="M123 40.5 L143 49.5 V33.5 L123 24.5 Z" class="fill-window" />
		<path
			d="M60 68 L80 58 L96 65 L76 75 Z"
			class="fill-item stroke-text stroke-[1.5]"
			stroke-linejoin="round"
		/>
		<path
			d="M76 75 V80 L96 70 V65 M60 68 V73 L76 80"
			class="fill-none stroke-text stroke-[1.5]"
			stroke-linejoin="round"
		/>
		<circle cx="100" cy="72" r="11" class="fill-electric opacity-30" />
		<circle cx="100" cy="72" r="4" class="fill-electric" />
	{:else if id === 'furnish'}
		<rect
			x="22"
			y="14"
			width="156"
			height="84"
			rx="4"
			class="fill-surface stroke-text stroke-[3]"
		/>
		<rect x="34" y="26" width="52" height="38" rx="5" class="fill-item" />
		<rect x="34" y="26" width="52" height="12" rx="4" class="fill-muted opacity-40" />
		<rect
			x="100"
			y="26"
			width="30"
			height="22"
			rx="3"
			class="fill-suggested stroke-suggested stroke-2 opacity-30"
			stroke-dasharray="4 3"
		/>
		<rect x="98" y="50" width="34" height="22" rx="3" class="fill-item" />
		<rect
			x="118"
			y="56"
			width="26"
			height="22"
			rx="3"
			class="fill-danger-soft stroke-danger stroke-2"
		/>
		<path d="M144 66 l8 0" class="fill-none stroke-danger stroke-2" stroke-linecap="round" />
		<rect x="34" y="72" width="44" height="18" rx="9" class="fill-accent" />
		<text x="56" y="85" text-anchor="middle" class="fill-accent-contrast text-[10px] font-bold"
			>CHF</text
		>
		<path
			d="M140 22 l10 0 M145 17 v10"
			class="fill-none stroke-accent stroke-2"
			stroke-linecap="round"
		/>
	{:else if id === 'package'}
		<rect
			x="18"
			y="22"
			width="52"
			height="68"
			rx="6"
			class="fill-surface stroke-text stroke-[2.5]"
		/>
		<rect x="26" y="32" width="36" height="6" rx="3" class="fill-danger" />
		<path
			d="M26 48 H62 M26 56 H62 M26 64 H50"
			class="fill-none stroke-border stroke-[3]"
			stroke-linecap="round"
		/>
		<rect x="30" y="74" width="28" height="10" rx="3" class="fill-accent" />
		<path
			d="M78 46 H108 M100 38 L108 46 L100 54"
			class="fill-none stroke-accent stroke-[3]"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<path
			d="M112 22 H178 A8 8 0 0 1 186 30 V64 A8 8 0 0 1 178 72 H138 L124 86 V72 H112 A8 8 0 0 1 104 64 V30 A8 8 0 0 1 112 22 Z"
			class="fill-accent-soft stroke-accent stroke-[2.5]"
			stroke-linejoin="round"
		/>
		<path d="M133 36 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" class="fill-accent" />
		<path
			d="M158 40 H172 M158 50 H168 M158 60 H172"
			class="fill-none stroke-accent stroke-2"
			stroke-linecap="round"
		/>
		<path
			d="M110 98 H80 M88 90 L80 98 L88 106"
			class="fill-none stroke-suggested stroke-[3]"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<text x="150" y="100" text-anchor="middle" class="fill-muted text-[10px] font-bold">JSON</text>
	{:else}
		<g transform="translate(0 6)">
			<path
				d="M44 40 A18 18 0 0 1 62 24 A24 24 0 0 1 110 28 A20 20 0 0 1 138 44 V46 H44 Z"
				class="fill-surface stroke-accent stroke-[2.5]"
				stroke-linejoin="round"
			/>
			<path
				d="M82 36 l8 8 14 -16"
				class="fill-none stroke-accent stroke-[3.5]"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</g>
		<rect
			x="40"
			y="66"
			width="80"
			height="36"
			rx="5"
			class="fill-surface stroke-text stroke-[2.5]"
		/>
		<path d="M40 76 H120" class="fill-none stroke-text stroke-2" />
		<circle cx="50" cy="71" r="1.8" class="fill-door" />
		<circle cx="57" cy="71" r="1.8" class="fill-electric" />
		<circle cx="64" cy="71" r="1.8" class="fill-accent" />
		<path
			d="M50 88 H92 M50 95 H78"
			class="fill-none stroke-border stroke-[3]"
			stroke-linecap="round"
		/>
		<rect
			x="140"
			y="64"
			width="40"
			height="38"
			rx="9"
			class="fill-surface stroke-border stroke-2"
		/>
		<path
			d="M152 78 L147 83 L152 88 M147 83 H164 A7.5 7.5 0 0 1 164 98 H156"
			class="fill-none stroke-text stroke-[2.5]"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{/if}
</svg>
