import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ProjectStatus } from '@/app/types/project';

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
	try {
		const { projectId } = await params;

		// Verify project exists
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Generate a process ID
		const processId = uuidv4();

		// Update metadata
		const metadataPath = path.join(projectDir, 'metadata.json');
		if (!fs.existsSync(metadataPath)) {
			return NextResponse.json({ error: 'Project metadata not found' }, { status: 404 });
		}

		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.cleaningProcessId = processId;
		metadata.cleaningStartedAt = new Date().toISOString();
		metadata.cleaningStatus = 'in_progress';
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		// Start the cleaning process in the background
		cleanProject(projectId, processId).catch(console.error);

		return NextResponse.json({ projectId, processId });
	} catch (error) {
		console.error('Error starting cleanup process:', error);
		return NextResponse.json({ error: 'Failed to start cleanup process' }, { status: 500 });
	}
}

async function cleanProject(projectId: string, processId: string) {
	const projectDir = path.join(process.cwd(), 'projects', projectId);
	const metadataPath = path.join(projectDir, 'metadata.json');

	try {
		console.log(`Starting cleanup for project: ${projectId}`);

		// Clean up temporary directories
		const tempDirs = [path.join(projectDir, 'temp'), path.join(projectDir, 'captions')];

		// Clean each temp directory
		for (const dir of tempDirs) {
			if (fs.existsSync(dir)) {
				console.log(`Cleaning directory: ${dir}`);
				await fs.promises.rm(dir, { recursive: true, force: true });
			}
		}

		// Check for any leftover backup files (*.bak)
		const files = fs.readdirSync(projectDir);
		for (const file of files) {
			if (file.endsWith('.bak')) {
				const backupPath = path.join(projectDir, file);
				console.log(`Removing backup file: ${backupPath}`);
				await fs.promises.unlink(backupPath);
			}
		}

		// Update metadata to reflect successful cleaning
		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
		metadata.cleaningStatus = 'completed';
		metadata.cleaningCompletedAt = new Date().toISOString();
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		console.log(`Cleanup completed for project: ${projectId}`);
	} catch (error) {
		console.error(`Error during cleanup for project ${projectId}:`, error);

		// Update metadata with error
		try {
			const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
			metadata.cleaningStatus = 'error';
			metadata.cleaningError = error instanceof Error ? error.message : String(error);
			fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
		} catch (metadataError) {
			console.error('Failed to update metadata with error:', metadataError);
		}
	}
}
