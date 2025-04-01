import fs from 'fs';
import path from 'path';
import { ProjectStatus, ProjectMetadata } from '@/app/types/project';

/**
 * Get the path to the metadata file for a project
 */
export function getMetadataPath(projectId: string): string {
	return path.join(process.cwd(), 'projects', projectId, 'metadata.json');
}

/**
 * Get the metadata for a project
 */
export function getProjectMetadata(projectId: string): ProjectMetadata | null {
	const metadataPath = getMetadataPath(projectId);

	if (!fs.existsSync(metadataPath)) {
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
	} catch (err) {
		console.error(`Error reading metadata for project ${projectId}:`, err);
		return null;
	}
}

/**
 * Update the metadata for a project
 */
export function updateProjectMetadata(projectId: string, updates: Partial<ProjectMetadata>): boolean {
	const metadataPath = getMetadataPath(projectId);

	if (!fs.existsSync(metadataPath)) {
		return false;
	}

	try {
		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		const updatedMetadata = { ...metadata, ...updates };
		fs.writeFileSync(metadataPath, JSON.stringify(updatedMetadata, null, 2));
		return true;
	} catch (err) {
		console.error(`Error updating metadata for project ${projectId}:`, err);
		return false;
	}
}

/**
 * Update the progress of a project
 */
export function updateProjectProgress(projectId: string, processId: string, progressValue: number): boolean {
	const metadata = getProjectMetadata(projectId);
	if (!metadata) {
		return false;
	}

	// Initialize progress object if it doesn't exist
	const progress = metadata.progress || {};

	// Update the progress for this processId
	progress[processId] = progressValue;

	return updateProjectMetadata(projectId, { progress });
}

/**
 * Update the status of a project
 */
export function updateProjectStatus(projectId: string, status: ProjectStatus, error?: string): boolean {
	const updates: Partial<ProjectMetadata> = { status };

	if (error) {
		updates.error = error;
	} else {
		// Clear any existing error when setting a non-error status
		updates.error = undefined;
	}

	return updateProjectMetadata(projectId, updates);
}

/**
 * Initialize captioning metadata for a project if it doesn't exist
 */
export function ensureCaptioningMetadata(projectId: string): boolean {
	const metadata = getProjectMetadata(projectId);

	if (!metadata) {
		return false;
	}

	if (!metadata.captioning) {
		return updateProjectMetadata(projectId, {
			captioning: {
				captioningAttempted: true,
				captioningModel: 'whisper:base.en',
				captionedSegments: [],
				failedSegments: [],
				inProgress: [],
			},
		});
	}

	return true;
}

/**
 * Get the path to the segments file for a project
 */
export function getSegmentsPath(projectId: string): string {
	return path.join(process.cwd(), 'projects', projectId, 'segments.json');
}

/**
 * Get the segments for a project
 */
export function getProjectSegments(projectId: string): any[] | null {
	const segmentsPath = getSegmentsPath(projectId);

	if (!fs.existsSync(segmentsPath)) {
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(segmentsPath, 'utf-8'));
	} catch (err) {
		console.error(`Error reading segments for project ${projectId}:`, err);
		return null;
	}
}

/**
 * Save segments for a project
 */
export function saveProjectSegments(projectId: string, segments: any[]): boolean {
	const segmentsPath = getSegmentsPath(projectId);

	try {
		fs.writeFileSync(segmentsPath, JSON.stringify(segments, null, 2));
		return true;
	} catch (err) {
		console.error(`Error saving segments for project ${projectId}:`, err);
		return false;
	}
}

/**
 * Get the path to a segment file
 */
export function getSegmentPath(projectId: string, segmentFilename: string): string {
	return path.join(process.cwd(), 'projects', projectId, 'segments', segmentFilename);
}

/**
 * Ensure the segments directory exists for a project
 */
export function ensureSegmentsDirectory(projectId: string): boolean {
	const segmentsDir = path.join(process.cwd(), 'projects', projectId, 'segments');

	try {
		fs.mkdirSync(segmentsDir, { recursive: true });
		return true;
	} catch (err) {
		console.error(`Error creating segments directory for project ${projectId}:`, err);
		return false;
	}
}

/**
 * Update captioning progress for a segment
 */
export function updateCaptioningProgress(projectId: string, segmentId: number, progress: number): boolean {
	const metadata = getProjectMetadata(projectId);

	if (!metadata || !metadata.captioning || !metadata.captioning.inProgress) {
		return false;
	}

	// Find the in-progress entry for this segment
	const inProgressIndex = metadata.captioning.inProgress.findIndex((p) => p.segmentNumber === segmentId);

	if (inProgressIndex < 0) {
		return false;
	}

	try {
		const updatedCaptioning = { ...metadata.captioning };
		if (!updatedCaptioning.inProgress) {
			updatedCaptioning.inProgress = [];
		}
		updatedCaptioning.inProgress[inProgressIndex].progress = progress;

		return updateProjectMetadata(projectId, { captioning: updatedCaptioning });
	} catch (err) {
		console.error(`Error updating captioning progress for segment ${segmentId}:`, err);
		return false;
	}
}
