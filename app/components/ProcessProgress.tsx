import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { ProjectMetadata, ProjectStatus } from '@/app/types/project';

interface ProcessProgressProps {
	metadata: ProjectMetadata;
	progress: number;
	showSegmentInfo?: boolean;
	className?: string;
}

export function ProcessProgress({ metadata, progress, showSegmentInfo = true, className = '' }: ProcessProgressProps) {
	// Check if we should display this component based on the project status
	const shouldDisplay = () => {
		// For download process
		if (metadata.currentProcess === 'download') {
			return metadata.status === ProjectStatus.DOWNLOADING || metadata.status === ProjectStatus.INITIALIZING;
		}

		// For merge process
		if (metadata.currentProcess === 'merge') {
			return metadata.status === ProjectStatus.MERGING;
		}

		// For split process
		if (metadata.currentProcess === 'split') {
			return metadata.status === ProjectStatus.SEGMENTING || metadata.status === ProjectStatus.INITIALIZING;
		}

		// Default case - don't display if no process match
		return false;
	};

	// Don't render anything if we shouldn't display based on status
	if (!shouldDisplay()) {
		return null;
	}

	const getProcessLabel = () => {
		switch (metadata.currentProcess) {
			case 'download':
				return 'Downloading and processing media...';
			case 'merge':
				return 'Merging video and audio...';
			case 'split':
				return 'Splitting video into segments...';
			default:
				return 'Processing...';
		}
	};

	const getSegmentInfo = () => {
		if (!showSegmentInfo || !metadata.currentSegment || !metadata.totalSegments) {
			return `${progress}%`;
		}

		return `Segment ${metadata.currentSegment} of ${metadata.totalSegments} (${progress}%)`;
	};

	return (
		<Card className={className}>
			<CardContent className='pt-6 space-y-2'>
				<p>{getProcessLabel()}</p>
				<Progress value={progress} />
				<p className='text-sm text-center'>{getSegmentInfo()}</p>
				{metadata.error && <p className='text-red-500 text-sm'>{metadata.error}</p>}
			</CardContent>
		</Card>
	);
}
