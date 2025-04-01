import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; filename: string }> }) {
	try {
		const { projectId, filename } = await params;

		// Verify project exists
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		if (!fs.existsSync(projectDir)) {
			return NextResponse.json({ error: 'Project not found' }, { status: 404 });
		}

		// Construct path to caption file
		const captionPath = path.join(projectDir, 'captions', filename);

		// Check if caption file exists
		if (!fs.existsSync(captionPath)) {
			return NextResponse.json({ error: 'Caption file not found' }, { status: 404 });
		}

		// Get file stats for content-length
		const stat = fs.statSync(captionPath);

		// Read the file
		const videoFile = fs.readFileSync(captionPath);

		// Create response with proper MIME type
		const response = new NextResponse(videoFile, {
			status: 200,
			headers: {
				'Content-Type': 'video/mp4',
				'Content-Length': stat.size.toString(),
				'Accept-Ranges': 'bytes',
			},
		});

		return response;
	} catch (error) {
		console.error('Error serving caption file:', error);
		return NextResponse.json({ error: 'Failed to serve caption file' }, { status: 500 });
	}
}
