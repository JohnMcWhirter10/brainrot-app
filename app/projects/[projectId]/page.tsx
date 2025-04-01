'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProjectStatus } from '@/app/types/project';
import { toast } from 'sonner';
import { useProcessProgress } from '@/app/hooks/useProcessProgress';
import { useSegmentsProgress } from '@/app/hooks/useSegmentsProgress';
import { ProcessProgress } from '@/app/components/ProcessProgress';
import { ProcessButtons } from '@/app/components/ProcessButtons';

interface Segment {
	id: number;
	filename: string;
	duration: number;
	captioningStatus?: string;
	captioningProgress?: number;
	subtitle?: string;
	captionedFilename?: string;
}

export default function ProjectPage() {
	const { projectId } = useParams();
	const [videoPreview, setVideoPreview] = useState<{ open: boolean; url: string }>({ open: false, url: '' });

	// Replace the manual metadata fetching with the custom hook
	const {
		metadata,
		loading: metadataLoading,
		error: metadataError,
		progress,
		fetchMetadata,
	} = useProcessProgress(projectId as string, {
		onError: (err) => toast.error(err.message),
	});

	// Use our new hook for segment data with polling
	const {
		segments,
		loading: segmentsLoading,
		error: segmentsError,
		fetchSegments,
		inProgressCount,
		completedCount,
		readyForCaptioningCount,
	} = useSegmentsProgress(projectId as string, {
		onError: (err) => toast.error(`Failed to load segments: ${err.message}`),
	});

	// Start download process
	const handleStartDownload = async () => {
		try {
			const response = await fetch(`/api/projects/${projectId}/process/download`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					video: metadata?.videoUrl,
					audio: metadata?.audioUrl,
					startTime: 0,
					endTime: 0,
					audioStartTime: 0,
					audioEndTime: 0,
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to start download');
			}

			await fetchMetadata(); // Update the metadata after starting the process
			toast.success('Download started');
		} catch (err) {
			console.error('Error starting download:', err);
			toast.error('Failed to start download');
		}
	};

	// Start merge process
	const handleStartMerge = async () => {
		try {
			const response = await fetch(`/api/projects/${projectId}/process/merge`, {
				method: 'POST',
			});

			if (!response.ok) {
				throw new Error('Failed to start merge process');
			}

			toast.success('Merge process started');
			fetchMetadata();
		} catch (err) {
			toast.error('Failed to start merge process');
			console.error(err);
		}
	};

	// Start split process
	const handleStartSplit = async () => {
		try {
			const response = await fetch(`/api/projects/${projectId}/process/split`, {
				method: 'POST',
			});

			if (!response.ok) {
				throw new Error('Failed to start splitting process');
			}

			toast.success('Splitting process started');
			fetchMetadata();
			// Refresh segments data after a delay to catch newly created segments
			setTimeout(fetchSegments, 2000);
		} catch (err) {
			toast.error('Failed to start splitting process');
			console.error(err);
		}
	};

	// Start caption process for a specific segment
	const handleStartCaption = async (segmentId: number) => {
		try {
			const response = await fetch(`/api/projects/${projectId}/process/caption`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					segmentNumber: segmentId,
				}),
			});

			if (!response.ok) {
				throw new Error(`Failed to start captioning for segment ${segmentId}`);
			}

			toast.success(`Captioning started for segment ${segmentId}`);
			fetchSegments(); // Refresh segment data immediately
		} catch (err) {
			toast.error(`Failed to start captioning for segment ${segmentId}`);
		}
	};

	// Start caption process for all segments
	const handleStartAllCaptions = async () => {
		try {
			// Get all segments that don't have a caption status or have failed
			const segmentsToCaption = segments.filter(
				(segment) => segment.captioningStatus !== 'completed' && segment.captioningStatus !== 'in-progress'
			);

			if (segmentsToCaption.length === 0) {
				toast.info('No segments need captioning');
				return;
			}

			toast.info(`Starting captioning for ${segmentsToCaption.length} segments...`);

			// Process sequentially to avoid overwhelming the server
			for (const segment of segmentsToCaption) {
				const response = await fetch(`/api/projects/${projectId}/process/caption`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						segmentNumber: segment.id,
					}),
				});

				// Small delay between requests
				await new Promise((resolve) => setTimeout(resolve, 500));
			}

			toast.success('Started captioning all segments');
			fetchSegments(); // Refresh segments data
		} catch (err) {
			toast.error('Failed to start captioning process');
		}
	};

	// Preview video in dialog
	const handlePreviewVideo = (segmentId: number) => {
		// Find the correct segment from the data
		const segment = segments.find((s) => s.id === segmentId);
		if (!segment) {
			toast.error(`Could not find segment ${segmentId}`);
			return;
		}

		let url = '';

		// If segment has been captioned and has a captioned filename, use that
		if (segment.captioningStatus === 'completed' && segment.captionedFilename) {
			url = `/api/projects/${projectId}/captions/${segment.captionedFilename}`;
		} else {
			// Otherwise use the original segment file
			url = `/api/projects/${projectId}/segments/${segment.filename}`;
		}

		setVideoPreview({ open: true, url });
	};

	// Show loading state only on initial load when metadata doesn't exist yet
	if (metadataLoading && !metadata) {
		return (
			<div className='container mx-auto py-10'>
				<Card>
					<CardContent className='pt-6'>
						<div className='flex justify-center items-center h-40'>
							<p>Loading project details...</p>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (metadataError || !metadata) {
		return (
			<div className='container mx-auto py-10'>
				<Card>
					<CardContent className='pt-6'>
						<div className='flex justify-center items-center h-40'>
							<p className='text-red-500'>{metadataError?.message || 'Failed to load project'}</p>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className='container mx-auto py-10'>
			<Card className='mb-8'>
				<CardHeader>
					<CardTitle>Project: {metadata.id}</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='mb-4'>
						<div className='mb-2 flex items-center gap-2'>
							Status: <Badge>{metadata.status}</Badge>
							{inProgressCount > 0 && (
								<Badge className='bg-yellow-500'>
									{inProgressCount} segment{inProgressCount !== 1 ? 's' : ''} in progress
								</Badge>
							)}
							{readyForCaptioningCount > 0 && (
								<Badge className='bg-blue-500'>
									{readyForCaptioningCount} segment{readyForCaptioningCount !== 1 ? 's' : ''} ready
									for captioning
								</Badge>
							)}
							{completedCount > 0 && segments.length > 0 && (
								<Badge className='bg-green-500'>
									{completedCount}/{segments.length} captioned
								</Badge>
							)}
						</div>
						{metadata.error && <p className='text-red-500 mb-2'>Error: {metadata.error}</p>}
					</div>

					{/* Process buttons with encapsulated state logic */}
					<ProcessButtons
						metadata={metadata}
						segments={segments}
						onStartDownload={handleStartDownload}
						onStartMerge={handleStartMerge}
						onStartSplit={handleStartSplit}
						onStartAllCaptions={handleStartAllCaptions}
						onStartSegmentCaption={handleStartCaption}
						progress={progress}
					/>
				</CardContent>
			</Card>

			{/* Segments List - only show when we have segments */}
			{segments.length > 0 && (
				<div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'>
					{segments.map((segment) => {
						const captionStatus = segment.captioningStatus || 'pending';
						const canGenerateCaptions = captionStatus !== 'completed' && captionStatus !== 'in-progress';

						return (
							<Card key={segment.id} className='inline-block w-auto'>
								<CardContent className='p-3 flex flex-col items-center gap-2'>
									<h3 className='font-medium text-center'>Part {segment.id}</h3>
									{segment.subtitle && (
										<p
											className='text-xs italic text-center max-w-full truncate'
											title={segment.subtitle}
										>
											{segment.subtitle}
										</p>
									)}
									<div className='flex flex-col gap-2 w-full'>
										<Button
											variant='outline'
											size='sm'
											onClick={() => handlePreviewVideo(segment.id)}
											className='w-full'
										>
											Preview
										</Button>
										{canGenerateCaptions && (
											<Button
												size='sm'
												onClick={() => handleStartCaption(segment.id)}
												className='w-full'
											>
												Caption
											</Button>
										)}
										{captionStatus === 'in-progress' &&
											segment.captioningProgress !== undefined && (
												<div className='w-full'>
													<Progress value={segment.captioningProgress} className='h-1' />
													<p className='text-xs text-right mt-0.5'>
														{segment.captioningProgress}%
													</p>
												</div>
											)}
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}

			{/* Video Preview Dialog */}
			<Dialog open={videoPreview.open} onOpenChange={(open) => setVideoPreview((prev) => ({ ...prev, open }))}>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>Video Preview</DialogTitle>
					</DialogHeader>
					<div className='aspect-[9/16] w-full'>
						<video src={videoPreview.url} controls autoPlay className='w-full h-full' />
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
