import type { Project } from '#lib/core/schema.ts';
import { currentStorageProblem, onStorageProblem, type StorageProblem } from './storageErrors.ts';

export const storageHealth = $state<{ problem: StorageProblem | null; unsaved: number }>({
	problem: currentStorageProblem(),
	unsaved: 0
});

const unsavedProjects = new Map<string, Project>();

onStorageProblem((problem) => {
	storageHealth.problem = problem;
});

export function markUnsaved(project: Project): void {
	unsavedProjects.set(project.id, project);
	storageHealth.unsaved = unsavedProjects.size;
}

export function markSaved(projectId: string): void {
	unsavedProjects.delete(projectId);
	storageHealth.unsaved = unsavedProjects.size;
}

export function unsavedSnapshots(): Project[] {
	return [...unsavedProjects.values()];
}
