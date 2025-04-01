import { useState, useEffect } from 'react';
import { ProjectMetadata, ProjectStatus } from '@/app/types/project';

interface UseProcessProgressOptions {
	pollingInterval?: number;
	onError?: (error: Error) => void;
}

interface ProcessProgress {
	main: number;
	videoDownload?: number;
	audioDownload?: number;

	// Merge process progress
	duration?: number;
	finalProcessing?: number;
}

export function useProcessProgress(projectId: string, options: UseProcessProgressOptions = {}) {
	const { pollingInterval = 2000 } = options;
	const [metadata, setMetadata] = useState<ProjectMetadata | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [progress, setProgress] = useState<ProcessProgress>({ main: 0 });
	const [isRefreshing, setIsRefreshing] = useState(false);

	// Function to calculate progress from metadata
	function calculateProgress(metadata: ProjectMetadata | null): ProcessProgress {
		if (!metadata?.progress) return { main: 0 };

		const result: ProcessProgress = { main: 0 };

		// Find the right processId to use for main progress
		let processId = '';
		if (metadata.currentProcess === 'download' && metadata.downloadProcessId) {
			processId = metadata.downloadProcessId;
		} else if (metadata.currentProcess === 'merge' && metadata.mergeProcessId) {
			processId = metadata.mergeProcessId;
		} else if (metadata.currentProcess === 'split' && metadata.splitProcessId) {
			processId = metadata.splitProcessId;
		}

		// Set main progress
		if (processId && metadata.progress[processId] !== undefined) {
			result.main = metadata.progress[processId];
		} else {
			// Fallback to max progress value
			const values = Object.values(metadata.progress);
			result.main = values.length ? Math.max(...values) : 0;
		}

		// Add download-specific progress
		if (metadata.currentProcess === 'download') {
			// Video download progress
			const videoDownloadId = `${metadata.downloadProcessId}_video`;
			if (metadata.progress[videoDownloadId] !== undefined) {
				result.videoDownload = metadata.progress[videoDownloadId];
			}

			// Audio download progress
			const audioDownloadId = `${metadata.downloadProcessId}_audio`;
			if (metadata.progress[audioDownloadId] !== undefined) {
				result.audioDownload = metadata.progress[audioDownloadId];
			}
		}

		// Add merge-specific progress
		if (metadata.currentProcess === 'merge') {
			// Duration calculation progress
			const durationId = `${metadata.mergeProcessId}_duration`;
			if (metadata.progress[durationId] !== undefined) {
				result.duration = metadata.progress[durationId];
			}

			// Final processing progress is same as main progress for merge
			result.finalProcessing = result.main;
		}

		return result;
	}

	// Fetch metadata and update state
	async function fetchMetadata() {
		try {
			setIsRefreshing(true);
			const response = await fetch(`/api/projects/${projectId}/metadata`);

			if (!response.ok) {
				throw new Error(`Failed to load project: ${response.status}`);
			}

			const data = await response.json();
			const projectMetadata = data.metadata;

			setMetadata(projectMetadata);
			setProgress(calculateProgress(projectMetadata));
			setError(null);
		} catch (err) {
			console.error('Error fetching project metadata:', err);
			const error = err instanceof Error ? err : new Error('Failed to load project details');
			setError(error);
			options.onError?.(error);
		} finally {
			// Only set loading to false after initial load
			if (loading) {
				setLoading(false);
			}
			setIsRefreshing(false);
		}
	}

	// Initial fetch on mount
	useEffect(() => {
		fetchMetadata();
	}, [projectId]); // Only refetch if projectId changes

	// Polling based on project status
	useEffect(() => {
		// Don't start polling if no metadata or not in an active state
		if (!metadata) return;

		const isActiveState = [
			ProjectStatus.INITIALIZING,
			ProjectStatus.DOWNLOADING,
			ProjectStatus.SEGMENTING,
			ProjectStatus.CAPTIONING,
			ProjectStatus.MERGING,
		].includes(metadata.status);

		// Only poll if in an active state
		if (!isActiveState) return;

		console.log(`Polling enabled for project ${projectId} with status: ${metadata.status}`);
		const interval = setInterval(fetchMetadata, pollingInterval);

		return () => clearInterval(interval);
	}, [projectId, metadata?.status, pollingInterval]);

	return {
		metadata,
		loading,
		isRefreshing,
		error,
		fetchMetadata,
		progress,
	};
}
