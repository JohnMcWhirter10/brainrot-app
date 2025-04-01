import { useState, useEffect } from 'react';

interface Segment {
	id: number;
	filename: string;
	duration: number;
	captioningStatus?: string;
	captioningProgress?: number;
	captioningError?: string;
	captioningCompletedAt?: string;
	subtitle?: string;
	captionedFilename?: string;
}

interface UseSegmentsProgressOptions {
	pollingInterval?: number;
	onError?: (error: Error) => void;
}

export function useSegmentsProgress(projectId: string, options: UseSegmentsProgressOptions = {}) {
	const { pollingInterval = 2000 } = options;
	const [segments, setSegments] = useState<Segment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	// Function to fetch segments data
	async function fetchSegments() {
		try {
			setIsRefreshing(true);
			const response = await fetch(`/api/projects/${projectId}/segments`);

			if (!response.ok) {
				throw new Error(`Failed to load segments: ${response.status}`);
			}

			const data = await response.json();
			setSegments(data.segments);
			setError(null);
		} catch (err) {
			console.error('Error fetching segments:', err);
			const error = err instanceof Error ? err : new Error('Failed to load segments');
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
		fetchSegments();
	}, [projectId]); // Only refetch if projectId changes

	// Polling if any segment is in progress
	useEffect(() => {
		// Don't start polling if no segments or still loading
		if (loading || segments.length === 0) return;

		// Define conditions for polling:
		// 1. Any segment is in-progress (already being captioned)
		const hasInProgressSegment = segments.some((segment) => segment.captioningStatus === 'in-progress');

		// 2. Check for segments ready for captioning (split completed but not yet captioned)
		const hasReadyForCaptioningSegment = segments.some(
			(segment) => !segment.captioningStatus || segment.captioningStatus === 'ready'
		);

		// 3. Check for recently completed segments (to update UI more quickly)
		const hasRecentlyCompletedSegment = segments.some(
			(segment) =>
				segment.captioningStatus === 'completed' &&
				segment.captionedFilename &&
				Date.now() - new Date(segment.captioningCompletedAt || 0).getTime() < 30000 // Within last 30 seconds
		);

		// Poll if any of these conditions are true
		const shouldPoll = hasInProgressSegment || hasReadyForCaptioningSegment || hasRecentlyCompletedSegment;

		if (!shouldPoll) return;

		console.log(`Polling enabled for segments in project ${projectId}`, {
			inProgress: hasInProgressSegment,
			readyForCaptioning: hasReadyForCaptioningSegment,
			recentlyCompleted: hasRecentlyCompletedSegment,
		});

		const interval = setInterval(fetchSegments, pollingInterval);

		return () => clearInterval(interval);
	}, [projectId, segments, loading, pollingInterval]);

	return {
		segments,
		loading,
		isRefreshing,
		error,
		fetchSegments,
		inProgressCount: segments.filter((s) => s.captioningStatus === 'in-progress').length,
		completedCount: segments.filter((s) => s.captioningStatus === 'completed').length,
		failedCount: segments.filter((s) => s.captioningStatus === 'failed').length,
		readyForCaptioningCount: segments.filter((s) => !s.captioningStatus || s.captioningStatus === 'ready').length,
		totalCount: segments.length,
	};
}
