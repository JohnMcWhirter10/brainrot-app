import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ProjectStatus } from '@/app/types/project';

interface CreateProps {
	videoUrl: string;
	startTime: number;
	endTime: number;
	audioUrl: string;
	audioStartTime: number;
	audioEndTime: number;
}

export async function POST(request: Request) {
	try {
		// Generate a unique project ID
		const projectId = uuidv4();

		// Get params from request body instead of route params
		const { videoUrl, startTime, endTime, audioUrl, audioStartTime, audioEndTime } = await request.json();

		// Validate required fields
		if (!videoUrl || !audioUrl) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Create project directory if it doesn't exist
		const projectDir = path.join(process.cwd(), 'projects', projectId);
		fs.mkdirSync(projectDir, { recursive: true });

		// Initialize basic metadata
		const metadata = {
			id: projectId,
			createdAt: new Date().toISOString(),
			status: ProjectStatus.INITIALIZED,
			videoUrl,
			startTime,
			endTime,
			audioUrl,
			audioStartTime,
			audioEndTime,
		};

		fs.writeFileSync(path.join(projectDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

		return NextResponse.json({ projectId });
	} catch (error) {
		console.error('Error creating project:', error);
		return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
	}
}
