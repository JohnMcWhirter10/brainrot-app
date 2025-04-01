import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ProjectStatus } from '@/app/types/project';

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
	try {
		const { projectId } = params;

		// Verify project exists
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Clean up temp directory
		const tempDir = path.join(projectDir, 'temp');
		if (fs.existsSync(tempDir)) {
			// Read all files in temp directory
			const tempFiles = fs.readdirSync(tempDir);

			// Delete each file
			for (const file of tempFiles) {
				fs.unlinkSync(path.join(tempDir, file));
			}

			// Log the cleanup
			console.log(`Cleaned up ${tempFiles.length} temporary files for project ${projectId}`);
		}

		// Update metadata
		const metadataPath = path.join(projectDir, 'metadata.json');
		if (fs.existsSync(metadataPath)) {
			const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
			metadata.cleanupStatus = 'completed';
			metadata.cleanupCompletedAt = new Date().toISOString();
			fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
		}

		return NextResponse.json({
			success: true,
			message: 'Project cleanup completed successfully',
		});
	} catch (error) {
		console.error('Error during project cleanup:', error);
		return NextResponse.json(
			{
				error: 'Failed to clean up project',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}
