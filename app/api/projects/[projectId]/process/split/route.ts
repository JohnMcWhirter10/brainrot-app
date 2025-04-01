import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { ProjectStatus } from '@/app/types/project';
import { findFfmpegPaths, getMediaDuration, parseTimeToSeconds } from '@/lib/utils/ffmpeg';
import {
	getProjectMetadata,
	updateProjectMetadata,
	updateProjectProgress,
	updateProjectStatus,
} from '@/lib/utils/project';

async function splitVideoIntoSegments(
	videoPath: string,
	outputDir: string,
	segmentDuration: number,
	ffmpegTools: { ffmpeg: string | null; ffprobe: string | null },
	projectId: string,
	processId: string
): Promise<Array<{ id: number; duration: number; filename: string }>> {
	if (!ffmpegTools.ffmpeg || !ffmpegTools.ffprobe) {
		throw new Error('FFmpeg tools are required for video segmentation');
	}

	// Create segments directory if it doesn't exist
	const segmentsDir = path.join(outputDir, 'segments');
	fs.mkdirSync(segmentsDir, { recursive: true });

	// Get the duration of the video
	const videoDuration = await getMediaDuration(videoPath, ffmpegTools.ffprobe, projectId, uuidv4());

	// Calculate how many segments we'll need
	const segmentCount = Math.ceil(videoDuration / segmentDuration);
	console.log(`Splitting video into ${segmentCount} segments of ${segmentDuration} seconds each`);

	const segments: Array<{ id: number; duration: number; filename: string }> = [];

	// Split the video into segments using FFmpeg
	for (let i = 0; i < segmentCount; i++) {
		// Calculate and update progress percentage based on completed segments
		const progressPercentage = Math.round((i / segmentCount) * 100);

		// Update progress and segment information
		updateProjectProgress(projectId, processId, progressPercentage);
		updateProjectMetadata(projectId, {
			currentSegment: i + 1,
			totalSegments: segmentCount,
		});

		const startTime = i * segmentDuration;
		const currentSegmentDuration = Math.min(segmentDuration, videoDuration - startTime);
		const segmentFilename = `segment_${i + 1}.mp4`;
		const segmentPath = path.join(segmentsDir, segmentFilename);

		await new Promise<void>((resolve, reject) => {
			// Use re-encoding rather than stream copy to ensure precise cutting
			// This avoids the keyframe alignment issue that causes frozen frames
			const cmd = spawn(ffmpegTools.ffmpeg!, [
				'-ss',
				startTime.toString(),
				'-i',
				videoPath,
				'-t',
				currentSegmentDuration.toString(),
				'-c:v',
				'libx264', // Re-encode video
				'-preset',
				'fast', // Fast encoding preset
				'-crf',
				'22', // Quality level
				'-c:a',
				'aac', // Re-encode audio
				'-b:a',
				'192k', // Audio bitrate
				'-avoid_negative_ts',
				'1', // Avoid negative timestamps
				'-reset_timestamps',
				'1', // Reset timestamps to start from 0
				'-y',
				segmentPath,
			]);

			let errorOutput = '';
			cmd.stderr.on('data', (data) => {
				const output = data.toString();
				// Just collect error output, segment progress is tracked by total segments completed
				if (!output.includes('frame=')) {
					errorOutput += output;
				}
			});

			cmd.on('close', (code) => {
				if (code !== 0) {
					console.error(`FFmpeg segment error: ${errorOutput}`);
					reject(new Error(`FFmpeg segment exited with code ${code}`));
					return;
				}
				resolve();
			});
		});

		segments.push({
			id: i + 1,
			duration: currentSegmentDuration,
			filename: segmentFilename,
		});
	}

	// Update progress to 100% when all segments are complete
	updateProjectProgress(projectId, processId, 100);
	updateProjectMetadata(projectId, {
		currentSegment: segmentCount,
		totalSegments: segmentCount,
	});

	return segments;
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const { projectId } = await params;

		// Get project directory
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Check if metadata exists
		const metadataPath = path.join(projectDir, 'metadata.json');
		if (!fs.existsSync(metadataPath)) {
			return NextResponse.json({ error: 'Project metadata not found' }, { status: 404 });
		}

		// Check for processed video file from trim step
		const mergeDir = path.join(projectDir, 'merge');
		const processedVideoPath = path.join(mergeDir, 'processed.mp4');

		if (!fs.existsSync(processedVideoPath)) {
			return NextResponse.json(
				{ error: 'Processed video file not found. Please run the merge process first.' },
				{ status: 400 }
			);
		}

		// Generate a process ID for tracking
		const processId = uuidv4();

		// Update metadata
		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.status = ProjectStatus.INITIALIZING;
		metadata.splitProcessId = processId;
		metadata.currentProcess = 'split';
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		// Initialize progress using the utility function
		updateProjectProgress(projectId, processId, 0);

		// Start background splitting process
		splitMedia(projectId, processId).catch(console.error);

		return NextResponse.json({ projectId, processId });
	} catch (error) {
		console.error('Error starting split process:', error);
		return NextResponse.json({ error: 'Failed to start split process' }, { status: 500 });
	}
}

// Process media - only handles splitting now
async function splitMedia(projectId: string, processId: string) {
	try {
		// Check for FFmpeg tools first
		const ffmpegTools = await findFfmpegPaths();
		if (!ffmpegTools.ffmpeg || !ffmpegTools.ffprobe) {
			throw new Error('FFmpeg tools not found. Please install FFmpeg and make sure it is in your PATH.');
		}

		// Get project directories
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		const mergeDir = path.join(projectDir, 'merge');

		const processedVideoPath = path.join(mergeDir, 'processed.mp4');

		// Update metadata
		const metadataPath = path.join(projectDir, 'metadata.json');
		let metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.status = ProjectStatus.SEGMENTING;
		metadata.currentSegment = 0;
		metadata.totalSegments = 0;
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		// Initialize progress using the utility function
		updateProjectProgress(projectId, processId, 0);

		// Split into segments
		const segments = await splitVideoIntoSegments(
			processedVideoPath,
			projectDir,
			60, // 1 minute in seconds
			ffmpegTools,
			projectId,
			processId
		);

		// Get the video duration
		const videoDuration = await getMediaDuration(processedVideoPath, ffmpegTools.ffprobe, projectId, uuidv4());

		// Update metadata with segments information
		metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.status = ProjectStatus.SEGMENTED;
		metadata.splitCompletedAt = new Date().toISOString();
		metadata.segments = segments.length;
		if (!metadata.totalDuration) {
			metadata.totalDuration = videoDuration;
		}
		metadata.splitProcessId = processId;
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		// Set final progress to 100% using the utility
		updateProjectProgress(projectId, processId, 100);

		// Save segments information
		fs.writeFileSync(path.join(projectDir, 'segments.json'), JSON.stringify(segments, null, 2));

		console.log(`Split processing completed for project: ${projectId}`);
	} catch (error) {
		console.error('Error during split processing:', error);

		// Update metadata with error using our utility
		updateProjectStatus(
			projectId,
			ProjectStatus.SEGMENTING_ERROR,
			error instanceof Error ? error.message : String(error)
		);
	}
}
