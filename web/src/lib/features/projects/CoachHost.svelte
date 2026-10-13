<script lang="ts">
	import { store } from '#lib/state/project.svelte.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import CoachMark from '#lib/ui/CoachMark.svelte';
	import { advanceCoach, coach, coachShows, skipCoach } from './coach.svelte.ts';
	import { coachProgress } from './coach.ts';
	import { messages } from './i18n.ts';

	let { page, hasProjects = false }: { page: 'projects' | 'plan'; hasProjects?: boolean } =
		$props();

	const hasRoom = $derived((store.project?.rooms.length ?? 0) > 0);

	$effect(() => {
		if (page === 'plan' || (page === 'projects' && hasProjects && !coach.replay)) advanceCoach(0);
	});
	$effect(() => {
		if (page === 'plan' && hasRoom && coach.step === 1 && store.project?.rooms[0]) {
			const timer = setTimeout(() => advanceCoach(1), 14000);
			return () => clearTimeout(timer);
		}
	});

	const projectStep = $derived(page === 'projects' && coachShows(0));
	const roomStep = $derived(page === 'plan' && coachShows(1));
	const buildStep = $derived(page === 'plan' && coachShows(2) && hasRoom);
</script>

{#if projectStep}
	<CoachMark
		anchor={'[data-testid="empty-create"], [data-testid="new-project"]'}
		prefer={['right', 'left', 'top']}
		title={t(messages, 'coachProjectTitle')}
		text={t(messages, 'coachProjectText')}
		progress={coachProgress(0)}
		nextLabel={t(messages, 'coachNext')}
		skipLabel={t(messages, 'coachSkip')}
		onnext={() => advanceCoach(0)}
		onskip={skipCoach}
	/>
{:else if roomStep}
	{#if hasRoom}
		<CoachMark
			anchor={'[data-testid="room-length"]'}
			prefer={['left', 'top']}
			title={t(messages, 'coachDimsTitle')}
			text={t(messages, 'coachDimsText')}
			progress={coachProgress(1)}
			nextLabel={t(messages, 'coachNext')}
			skipLabel={t(messages, 'coachSkip')}
			onnext={() => advanceCoach(1)}
			onskip={skipCoach}
		/>
	{:else}
		<CoachMark
			anchor={'[data-testid="empty-add"], [data-testid="add-room"]'}
			prefer={['right', 'left', 'top']}
			title={t(messages, 'coachRoomTitle')}
			text={t(messages, 'coachRoomText')}
			progress={coachProgress(1)}
			nextLabel={t(messages, 'coachNext')}
			skipLabel={t(messages, 'coachSkip')}
			onnext={() => advanceCoach(1)}
			onskip={skipCoach}
		/>
	{/if}
{:else if buildStep}
	<CoachMark
		anchor={'[data-testid="build"]'}
		avoid={'[data-sidepanel]'}
		title={t(messages, 'coachBuildTitle')}
		text={t(messages, 'coachBuildText')}
		progress={coachProgress(2)}
		nextLabel={t(messages, 'coachDone')}
		skipLabel={t(messages, 'coachSkip')}
		onnext={() => advanceCoach(2)}
		onskip={skipCoach}
	/>
{/if}
