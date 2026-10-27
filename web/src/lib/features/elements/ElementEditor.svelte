<script lang="ts">
	import { LIMITS } from '#lib/security/limits.ts';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Copy from '@lucide/svelte/icons/copy';
	import Minus from '@lucide/svelte/icons/minus';
	import PanelTopOpen from '@lucide/svelte/icons/panel-top-open';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { validateRoom } from '#lib/core/checks.ts';
	import { socketWidth } from '#lib/core/defaults.ts';
	import { elementFitsRoom } from '#lib/core/elements.ts';
	import { walls } from '#lib/core/geometry.ts';
	import { newId } from '#lib/core/ids.ts';
	import {
		isFreeElement,
		isWallElement,
		type AcWall,
		type CeilingLamp,
		type DataPort,
		type Door,
		type Shower,
		type RoomElement,
		type Socket,
		type Window as WindowElement,
		type WallElement
	} from '#lib/core/schema.ts';
	import { elementKindNames } from '#lib/i18n/common.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { store } from '#lib/state/project.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import NumberField from '#lib/ui/NumberField.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Switch from '#lib/ui/Switch.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { toasts } from '#lib/ui/toast.svelte.ts';
	import FreeFields from './FreeFields.svelte';
	import { cornerOffset, hasDepth, isCornerKind } from './free.ts';
	import { messages } from './i18n.ts';
	import KitchenFields from './KitchenFields.svelte';
	import { KIND_ICONS, kindColor } from './kinds.ts';
	import {
		MIN_WIDTH,
		centerHeight,
		clampOffset,
		distanceFromEnd,
		duplicateOffset,
		elevationForCenter,
		hasCenterHeight,
		nearestWindow,
		offsetFromEndDistance,
		radiatorUnderWindow,
		switchAboveWorktop,
		wallCorners,
		windowsOnWall
	} from './logic.ts';

	let { roomId, elementId }: { roomId: string; elementId: string } = $props();

	const room = $derived(store.room(roomId));
	const element = $derived(room?.elements.find((candidate) => candidate.id === elementId));
	const wallList = $derived(room ? walls(room.polygon) : []);
	const target = $derived(
		element && isWallElement(element) ? wallList[element.wall - 1] : undefined
	);
	const wallLength = $derived(Math.round(target?.length ?? 0));
	const startLabel = $derived(
		target ? wallCorners(room!.polygon, target.number).split('–')[0] : ''
	);
	const endLabel = $derived(target ? wallCorners(room!.polygon, target.number).split('–')[1] : '');
	const windows = $derived(
		element && isWallElement(element) && room ? windowsOnWall(room, element.wall) : []
	);

	const issues = $derived.by(() => {
		if (!room || !element) return [];
		const found: string[] = [];
		if (!elementFitsRoom(room, element))
			found.push(`${t(messages, 'notForRoom')}. ${t(messages, 'notForRoomHint')}`);
		for (const issue of validateRoom(room)) {
			if (!issue.elementIds.includes(element.id)) continue;
			if (issue.code === 'elementOutsideWall') found.push(t(messages, 'issueOutside'));
			else if (issue.code === 'elementTooHigh') found.push(t(messages, 'issueTooHigh'));
			else if (issue.code === 'elementOverlap') {
				const otherId = issue.elementIds.find((id) => id !== element.id);
				const other = room.elements.find((candidate) => candidate.id === otherId);
				found.push(
					t(messages, 'issueOverlap', { name: other ? t(elementKindNames, other.kind) : '' })
				);
			}
		}
		return found;
	});

	function key(name: string): { coalesce: string } {
		return { coalesce: `ed-${elementId}-${name}` };
	}

	function setWall(patch: Partial<Omit<WallElement, 'id' | 'kind'>>, name?: string): void {
		store.updateElement<WallElement>(roomId, elementId, patch, name ? key(name) : undefined);
	}

	function seal(): void {
		store.sealHistory();
	}

	function wallItems() {
		return wallList.map((entry) => ({
			value: String(entry.number),
			label: t(messages, 'wallOption', {
				n: entry.number,
				corners: wallCorners(room!.polygon, entry.number)
			})
		}));
	}

	function changeWall(next: string): void {
		if (!element || !isWallElement(element)) return;
		const number = Number(next);
		const nextWall = wallList[number - 1];
		if (!nextWall) return;
		setWall({ wall: number, offset: clampOffset(element.offset, element.width, nextWall.length) });
	}

	function changeGang(delta: number): void {
		if (!element || element.kind !== 'socket') return;
		const gang = Math.max(1, Math.min(8, element.gang + delta));
		if (gang === element.gang) return;
		const width = socketWidth(gang);
		const center = element.offset + element.width / 2;
		store.updateElement<Socket>(
			roomId,
			elementId,
			{ gang, width, offset: clampOffset(center - width / 2, width, wallLength) },
			key('gang')
		);
		seal();
	}

	function changeCenter(center: number): void {
		if (!element || !isWallElement(element)) return;
		setWall({ elevation: Math.max(0, elevationForCenter(center, element.height)) }, 'center');
	}

	function underWindow(): void {
		if (!element || element.kind !== 'radiator') return;
		const window = nearestWindow(windows, element);
		if (!window) return;
		setWall(radiatorUnderWindow(element, window, wallLength));
	}

	function aboveWorktop(): void {
		if (!element || element.kind !== 'switch') return;
		setWall({ elevation: Math.max(0, switchAboveWorktop(element.height)) });
	}

	function duplicate(): void {
		if (!element) return;
		const copy = { ...($state.snapshot(element) as RoomElement), id: newId() } as RoomElement;
		if (copy.kind === 'kitchenRun') {
			copy.modules = copy.modules.map((module) => ({ ...module, id: newId() }));
		}
		if (isWallElement(copy)) copy.offset = duplicateOffset(copy, wallLength);
		else if (isFreeElement(copy)) {
			copy.x += 400;
			copy.y += 400;
		} else if (copy.kind === 'ceilingLamp') {
			copy.x += 400;
			copy.y += 400;
		}
		store.addElement(roomId, copy);
		ui.selectedElementId = copy.id;
	}

	function remove(): void {
		if (!element) return;
		const name = t(elementKindNames, element.kind);
		store.removeElement(roomId, element.id);
		ui.selectedElementId = null;
		toasts.show({
			message: t(messages, 'deleted', { name }),
			actionLabel: t(messages, 'undo'),
			onaction: () => store.undo()
		});
	}

	function openWallView(): void {
		if (element && isWallElement(element)) ui.wallViewWall = element.wall;
	}

	const statusItems = $derived([
		{ value: 'existing', label: t(messages, 'statusExisting') },
		{ value: 'planned', label: t(messages, 'statusPlanned') }
	]);
</script>

{#if room && element}
	{@const Icon = KIND_ICONS[element.kind]}
	<section
		class="flex flex-col gap-4 rounded-lg border border-accent bg-surface p-4 shadow-soft"
		data-testid="element-editor"
	>
		<header class="flex items-center gap-3">
			<span
				class="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2"
				style="color: {kindColor(element.kind)}"
			>
				<Icon class="size-5" />
			</span>
			<h3 class="min-w-0 flex-1 truncate text-base font-bold">
				{t(elementKindNames, element.kind)}
			</h3>
			<IconButton
				icon={Copy}
				label={t(messages, 'duplicate')}
				variant="ghost"
				onclick={duplicate}
			/>
			<IconButton icon={Trash} label={t(messages, 'remove')} variant="danger" onclick={remove} />
		</header>

		<SegmentedControl
			items={statusItems}
			value={element.status === 'suggested' ? 'planned' : element.status}
			label={t(messages, 'status')}
			full
			onchange={(value) =>
				store.updateElement(roomId, elementId, { status: value as 'existing' | 'planned' })}
		/>

		{#if isWallElement(element)}
			<Select
				label={t(messages, 'wall')}
				options={wallItems()}
				value={String(element.wall)}
				onchange={changeWall}
			/>

			<div class="flex flex-col gap-3">
				<NumberField
					label={t(messages, 'fromCorner', { corner: startLabel })}
					value={element.offset}
					step={10}
					oninput={(mm) => setWall({ offset: mm }, 'offset')}
					onchange={seal}
				/>
				<NumberField
					label={t(messages, 'fromCorner', { corner: endLabel })}
					value={distanceFromEnd(element.offset, element.width, wallLength)}
					step={10}
					oninput={(mm) =>
						setWall({ offset: offsetFromEndDistance(mm, element.width, wallLength) }, 'offset')}
					onchange={seal}
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<NumberField
					stepper={false}
					label={t(messages, 'width')}
					value={element.width}
					min={MIN_WIDTH}
					step={10}
					oninput={(mm) => setWall({ width: mm }, 'width')}
					onchange={seal}
				/>
				<NumberField
					stepper={false}
					label={t(messages, 'height')}
					value={element.height}
					min={MIN_WIDTH}
					step={10}
					oninput={(mm) => setWall({ height: mm }, 'height')}
					onchange={seal}
				/>
				<NumberField
					stepper={false}
					label={t(messages, 'elevation')}
					value={element.elevation}
					min={0}
					step={10}
					oninput={(mm) => setWall({ elevation: mm }, 'elevation')}
					onchange={seal}
				/>
				{#if hasCenterHeight(element.kind)}
					<NumberField
						stepper={false}
						label={t(messages, 'centerHeight')}
						value={centerHeight(element.elevation, element.height)}
						min={0}
						step={10}
						oninput={changeCenter}
						onchange={seal}
					/>
				{:else}
					<NumberField
						stepper={false}
						label={t(messages, 'topEdge')}
						value={element.elevation + element.height}
						min={MIN_WIDTH}
						step={10}
						oninput={(mm) => setWall({ elevation: Math.max(0, mm - element.height) }, 'top')}
						onchange={seal}
					/>
				{/if}
				{#if hasDepth(element)}
					{@const depthKind = element}
					<NumberField
						stepper={false}
						label={t(messages, 'depth')}
						value={depthKind.depth}
						min={MIN_WIDTH}
						step={10}
						oninput={(mm) =>
							store.updateElement<typeof depthKind>(roomId, elementId, { depth: mm }, key('depth'))}
						onchange={seal}
					/>
				{/if}
			</div>
		{:else if isFreeElement(element)}
			<FreeFields {roomId} {element} polygon={room.polygon} />
		{:else if element.kind === 'ceilingLamp'}
			{@const lamp = element}
			<div class="flex flex-col gap-3">
				<NumberField
					label={t(messages, 'positionX')}
					value={lamp.x}
					oninput={(mm) => store.updateElement<CeilingLamp>(roomId, elementId, { x: mm }, key('x'))}
					onchange={seal}
				/>
				<NumberField
					label={t(messages, 'positionY')}
					value={lamp.y}
					oninput={(mm) => store.updateElement<CeilingLamp>(roomId, elementId, { y: mm }, key('y'))}
					onchange={seal}
				/>
			</div>
		{/if}

		{#if element.kind === 'door'}
			{@const door = element}
			<div class="flex flex-col gap-2">
				<span class="px-1 text-sm font-semibold text-muted">{t(messages, 'hinge')}</span>
				<div class="flex items-center gap-2">
					<SegmentedControl
						class="min-w-0 flex-1"
						full
						label={t(messages, 'hinge')}
						items={[
							{ value: 'start', label: t(messages, 'cornerLabel', { corner: startLabel }) },
							{ value: 'end', label: t(messages, 'cornerLabel', { corner: endLabel }) }
						]}
						value={door.hinge}
						onchange={(value) =>
							store.updateElement<Door>(roomId, elementId, { hinge: value as Door['hinge'] })}
					/>
					<IconButton
						icon={ArrowLeftRight}
						label={t(messages, 'flipHinge')}
						variant="secondary"
						onclick={() =>
							store.updateElement<Door>(roomId, elementId, {
								hinge: door.hinge === 'start' ? 'end' : 'start'
							})}
					/>
				</div>
				<span class="mt-1 px-1 text-sm font-semibold text-muted">{t(messages, 'swing')}</span>
				<div class="flex items-center gap-2">
					<SegmentedControl
						class="min-w-0 flex-1"
						full
						label={t(messages, 'swing')}
						items={[
							{ value: 'in', label: t(messages, 'swingIn') },
							{ value: 'out', label: t(messages, 'swingOut') },
							{ value: 'sliding', label: t(messages, 'swingSliding') }
						]}
						value={door.swing}
						onchange={(value) =>
							store.updateElement<Door>(roomId, elementId, { swing: value as Door['swing'] })}
					/>
					<IconButton
						icon={ArrowLeftRight}
						label={t(messages, 'flipSwing')}
						variant="secondary"
						disabled={door.swing === 'sliding'}
						onclick={() =>
							store.updateElement<Door>(roomId, elementId, {
								swing: door.swing === 'in' ? 'out' : 'in'
							})}
					/>
				</div>
			</div>
		{:else if element.kind === 'window'}
			<Select
				label={t(messages, 'windowType')}
				options={[
					{ value: 'tiltTurn', label: t(messages, 'windowTiltTurn') },
					{ value: 'sliding', label: t(messages, 'windowSliding') },
					{ value: 'fixed', label: t(messages, 'windowFixed') },
					{ value: 'balconyDoor', label: t(messages, 'windowBalconyDoor') }
				]}
				value={element.windowType}
				onchange={(value) =>
					store.updateElement<WindowElement>(roomId, elementId, {
						windowType: value as WindowElement['windowType']
					})}
			/>
		{:else if element.kind === 'socket'}
			{@const socket = element}
			<div class="flex flex-col gap-1">
				<span class="px-1 text-sm font-semibold text-muted">{t(messages, 'gang')}</span>
				<div class="flex items-center gap-3">
					<IconButton
						icon={Minus}
						label={t(messages, 'gangLess')}
						variant="secondary"
						disabled={socket.gang <= 1}
						onclick={() => changeGang(-1)}
					/>
					<span class="min-w-8 text-center text-lg font-bold tabular-nums">{socket.gang}</span>
					<IconButton
						icon={Plus}
						label={t(messages, 'gangMore')}
						variant="secondary"
						disabled={socket.gang >= 8}
						onclick={() => changeGang(1)}
					/>
				</div>
			</div>
			<Switch
				checked={socket.usb}
				label={t(messages, 'usb')}
				onchange={(checked) => store.updateElement<Socket>(roomId, elementId, { usb: checked })}
			/>
		{:else if element.kind === 'dataPort'}
			<SegmentedControl
				full
				label={t(messages, 'portType')}
				items={[
					{ value: 'lan', label: t(messages, 'portLan') },
					{ value: 'tv', label: t(messages, 'portTv') },
					{ value: 'both', label: t(messages, 'portBoth') }
				]}
				value={element.portType}
				onchange={(value) =>
					store.updateElement<DataPort>(roomId, elementId, {
						portType: value as DataPort['portType']
					})}
			/>
		{/if}

		{#if isCornerKind(element.kind) && isWallElement(element)}
			<div class="grid grid-cols-2 gap-2">
				<Button
					variant="secondary"
					onclick={() => setWall({ offset: cornerOffset('start', element.width, wallLength) })}
					data-testid="corner-start"
				>
					{t(messages, 'inCorner', { corner: startLabel })}
				</Button>
				<Button
					variant="secondary"
					onclick={() => setWall({ offset: cornerOffset('end', element.width, wallLength) })}
					data-testid="corner-end"
				>
					{t(messages, 'inCorner', { corner: endLabel })}
				</Button>
			</div>
		{/if}
		{#if element.kind === 'shower'}
			{@const shower = element}
			<Switch
				checked={shower.screen === true}
				label={t(messages, 'screen')}
				onchange={(checked) =>
					store.updateElement<Shower>(roomId, elementId, { screen: checked || undefined })}
			/>
		{:else if element.kind === 'acWall'}
			{@const unit = element}
			<NumberField
				stepper={false}
				label={t(messages, 'clearanceAir')}
				value={unit.clearance}
				min={0}
				step={50}
				oninput={(mm) =>
					store.updateElement<AcWall>(roomId, elementId, { clearance: mm }, key('clearance'))}
				onchange={seal}
			/>
		{:else if element.kind === 'kitchenRun'}
			<KitchenFields {roomId} run={element} />
		{/if}

		{#if element.kind === 'radiator'}
			<Button
				variant="secondary"
				icon={ArrowLeftRight}
				disabled={windows.length === 0}
				onclick={underWindow}
				full
			>
				{windows.length === 0 ? t(messages, 'underWindowNone') : t(messages, 'underWindow')}
			</Button>
		{:else if element.kind === 'switch'}
			<Button variant="secondary" onclick={aboveWorktop} full>
				{t(messages, 'aboveWorktop')}
			</Button>
		{/if}

		<TextField
			label={t(messages, 'note')}
			maxlength={LIMITS.text}
			value={element.note ?? ''}
			oninput={(value) =>
				store.updateElement(roomId, elementId, { note: value || undefined }, key('note'))}
			onchange={seal}
		/>

		{#if element.reason}
			<p class="rounded-md bg-surface-2 p-3 text-sm text-muted">{element.reason}</p>
		{/if}

		{#if issues.length > 0}
			<ul class="flex flex-col gap-1.5" aria-live="polite">
				{#each issues as issue (issue)}
					<li class="flex items-start gap-2 rounded-md bg-warning-soft p-2.5 text-sm text-warning">
						<TriangleAlert class="mt-0.5 size-4 shrink-0" />
						<span>{issue}</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if isWallElement(element)}
			<Button variant="secondary" icon={PanelTopOpen} full onclick={openWallView}>
				{t(messages, 'wallView')}
			</Button>
		{/if}
	</section>
{/if}
