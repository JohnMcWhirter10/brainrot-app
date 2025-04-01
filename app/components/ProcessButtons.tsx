import React from 'react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ProjectMetadata, ProjectStatus } from '@/app/types/project';

interface Segment {
	id: number;
	filename: string;
	duration: number;
	captioningStatus?: string;
	captioningProgress?: number;
	subtitle?: string;
	captionedFilename?: string;
}

interface ProcessButtonsProps {
	metadata: ProjectMetadata;
	segments?: Segment[];
	onStartDownload: () => void;
	onStartMerge: () => void;
	onStartSplit: () => void;
	onStartAllCaptions: () => void;
	onStartSegmentCaption?: (segmentId: number) => void;
	className?: string;
	progress: {
		main: number;
		videoDownload?: number;
		audioDownload?: number;
		duration?: number;
		finalProcessing?: number;
	};
}

export function ProcessButtons({
	metadata,
	segments = [],
	onStartDownload,
	onStartMerge,
	onStartSplit,
	onStartAllCaptions,
	onStartSegmentCaption,
	className = '',
	progress,
}: ProcessButtonsProps) {
	const getProcessStatus = (process: string): { status: string; color: string } => {
		// First check if the process has been completed based on status
		switch (process) {
			case 'download':
				const isDownloaded = [
					ProjectStatus.DOWNLOADED,
					ProjectStatus.MERGING,
					ProjectStatus.MERGED,
					ProjectStatus.SEGMENTING,
					ProjectStatus.SEGMENTED,
					ProjectStatus.CAPTIONING,
					ProjectStatus.CAPTIONED,
				].includes(metadata.status);
				if (isDownloaded) {
					return { status: 'Completed', color: 'bg-green-500' };
				}
				break;

			case 'merge':
				const isMerged = [
					ProjectStatus.MERGED,
					ProjectStatus.SEGMENTING,
					ProjectStatus.SEGMENTED,
					ProjectStatus.CAPTIONING,
					ProjectStatus.CAPTIONED,
				].includes(metadata.status);
				if (isMerged) {
					return { status: 'Completed', color: 'bg-green-500' };
				}
				break;

			case 'split':
				const isSplit = [ProjectStatus.SEGMENTED, ProjectStatus.CAPTIONING, ProjectStatus.CAPTIONED].includes(
					metadata.status
				);
				if (isSplit) {
					return { status: 'Completed', color: 'bg-green-500' };
				}
				break;

			case 'caption':
				const isCaptioned = [ProjectStatus.CAPTIONED].includes(metadata.status);
				if (isCaptioned) {
					return { status: 'Completed', color: 'bg-green-500' };
				}
				break;
		}

		// Then check if the process is currently running
		if (metadata.currentProcess === process) {
			// Process is active - check if it has error
			if (metadata.status.includes('ERROR')) {
				return { status: 'Failed', color: 'bg-red-500' };
			}

			// Check for specific statuses that indicate completion despite currentProcess
			if (process === 'split' && metadata.status === ProjectStatus.SEGMENTED) {
				return { status: 'Completed', color: 'bg-green-500' };
			} else if (process === 'download' && metadata.status === ProjectStatus.DOWNLOADED) {
				return { status: 'Completed', color: 'bg-green-500' };
			} else if (process === 'merge' && metadata.status === ProjectStatus.MERGED) {
				return { status: 'Completed', color: 'bg-green-500' };
			}

			// Otherwise it's in progress
			return { status: 'In Progress', color: 'bg-yellow-500' };
		}

		// Default case - not started
		return { status: 'Pending', color: 'bg-gray-400' };
	};

	const downloadStatus = getProcessStatus('download');
	const mergeStatus = getProcessStatus('merge');
	const splitStatus = getProcessStatus('split');
	const captionStatus = getProcessStatus('caption');

	const isDownloadActive = metadata.currentProcess === 'download' && metadata.status === ProjectStatus.DOWNLOADING;
	const isMergeActive = metadata.currentProcess === 'merge' && metadata.status === ProjectStatus.MERGING;
	const isSplitActive = metadata.currentProcess === 'split' && metadata.status === ProjectStatus.SEGMENTING;

	return (
		<div className={`space-y-4 ${className}`}>
			<Accordion type='multiple' defaultValue={['download', 'merge', 'split', 'caption']} className='w-full'>
				{/* Download Process */}
				<AccordionItem value='download'>
					<AccordionTrigger className='flex justify-between'>
						<div className='flex items-center gap-2'>
							<span>1. Download Media</span>
							<Badge className={downloadStatus.color}>{downloadStatus.status}</Badge>
						</div>
					</AccordionTrigger>
					<AccordionContent>
						<div className='space-y-4 p-2'>
							<Button
								onClick={onStartDownload}
								variant={downloadStatus.status === 'Completed' ? 'outline' : 'default'}
							>
								{downloadStatus.status === 'Completed' ? 'Restart Download' : 'Start Download'}
							</Button>

							{isDownloadActive && (
								<div className='space-y-4 mt-2'>
									{/* Main progress bar */}
									<div>
										<p className='text-sm mb-1'>Overall download progress:</p>
										<Progress value={progress.main} className='h-2' />
										<p className='text-xs text-right mt-1'>{progress.main}%</p>
									</div>

									{/* Video download progress bar */}
									{progress.videoDownload !== undefined && (
										<div>
											<p className='text-sm mb-1'>Video download:</p>
											<Progress value={progress.videoDownload} className='h-2' />
											<p className='text-xs text-right mt-1'>{progress.videoDownload}%</p>
										</div>
									)}

									{/* Audio download progress bar */}
									{progress.audioDownload !== undefined && (
										<div>
											<p className='text-sm mb-1'>Audio download:</p>
											<Progress value={progress.audioDownload} className='h-2' />
											<p className='text-xs text-right mt-1'>{progress.audioDownload}%</p>
										</div>
									)}
								</div>
							)}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Merge Process */}
				<AccordionItem value='merge'>
					<AccordionTrigger className='flex justify-between'>
						<div className='flex items-center gap-2'>
							<span>2. Merge Media</span>
							<Badge className={mergeStatus.color}>{mergeStatus.status}</Badge>
						</div>
					</AccordionTrigger>
					<AccordionContent>
						<div className='space-y-4 p-2'>
							<Button
								onClick={onStartMerge}
								variant={mergeStatus.status === 'Completed' ? 'outline' : 'default'}
							>
								{mergeStatus.status === 'Completed' ? 'Restart Merging' : 'Start Merging'}
							</Button>

							{isMergeActive && (
								<div className='space-y-4 mt-2'>
									{/* Main progress bar */}
									<div>
										<p className='text-sm mb-1'>Overall merge progress:</p>
										<Progress value={progress.main} className='h-2' />
										<p className='text-xs text-right mt-1'>{progress.main}%</p>
									</div>

									{/* Duration calculation progress */}
									{progress.duration !== undefined && (
										<div>
											<p className='text-sm mb-1'>Duration calculation:</p>
											<Progress value={progress.duration} className='h-2' />
											<p className='text-xs text-right mt-1'>{progress.duration}%</p>
										</div>
									)}

									{/* Final processing progress */}
									{progress.finalProcessing !== undefined && (
										<div>
											<p className='text-sm mb-1'>Final processing:</p>
											<Progress value={progress.finalProcessing} className='h-2' />
											<p className='text-xs text-right mt-1'>{progress.finalProcessing}%</p>
										</div>
									)}
								</div>
							)}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Split Process */}
				<AccordionItem value='split'>
					<AccordionTrigger className='flex justify-between'>
						<div className='flex items-center gap-2'>
							<span>3. Split into Segments</span>
							<Badge className={splitStatus.color}>{splitStatus.status}</Badge>
						</div>
					</AccordionTrigger>
					<AccordionContent>
						<div className='space-y-4 p-2'>
							<Button
								onClick={onStartSplit}
								variant={splitStatus.status === 'Completed' ? 'outline' : 'default'}
							>
								{splitStatus.status === 'Completed' ? 'Restart Splitting' : 'Start Splitting'}
							</Button>

							{isSplitActive && (
								<div className='mt-2'>
									<p className='text-sm mb-1'>Splitting video into segments:</p>
									<Progress value={progress.main} className='h-2' />
									<p className='text-xs text-right mt-1'>{progress.main}%</p>
								</div>
							)}
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Caption Process */}
				<AccordionItem value='caption'>
					<AccordionTrigger className='flex justify-between'>
						<div className='flex items-center gap-2'>
							<span>4. Generate Captions</span>
							<Badge className={captionStatus.color}>{captionStatus.status}</Badge>
						</div>
					</AccordionTrigger>
					<AccordionContent>
						<div className='space-y-4 p-2'>
							<Button
								onClick={onStartAllCaptions}
								variant={captionStatus.status === 'Completed' ? 'outline' : 'default'}
							>
								{captionStatus.status === 'Completed'
									? 'Regenerate All Captions'
									: 'Generate All Captions'}
							</Button>

							{/* Segment captioning status */}
							{segments.length > 0 && (
								<div className='mt-4 border rounded-lg p-3 space-y-3'>
									<h4 className='text-sm font-medium'>Segment Captioning Status</h4>
									{segments.map((segment) => {
										const isInProgress = segment.captioningStatus === 'in-progress';
										const isCompleted = segment.captioningStatus === 'completed';
										const isFailed = segment.captioningStatus === 'failed';

										return (
											<div key={segment.id} className='space-y-1'>
												<div className='flex justify-between items-center'>
													<span className='text-xs'>Part {segment.id}</span>
													{isCompleted && <Badge className='bg-green-500'>Completed</Badge>}
													{isInProgress && (
														<Badge className='bg-yellow-500'>In Progress</Badge>
													)}
													{isFailed && <Badge variant='destructive'>Failed</Badge>}
													{!isCompleted && !isInProgress && !isFailed && (
														<Badge className='bg-gray-400'>Pending</Badge>
													)}
												</div>

												{/* Show progress bar for in-progress captioning */}
												{isInProgress && segment.captioningProgress !== undefined && (
													<div>
														<Progress value={segment.captioningProgress} className='h-1' />
														<p className='text-xs text-right mt-0.5'>
															{segment.captioningProgress}%
														</p>
													</div>
												)}

												{/* Show caption button for pending segments */}
												{!isCompleted && !isInProgress && onStartSegmentCaption && (
													<Button
														size='sm'
														variant='outline'
														className='w-full mt-1 text-xs h-7'
														onClick={() => onStartSegmentCaption(segment.id)}
													>
														Caption This Segment
													</Button>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</div>
	);
}
