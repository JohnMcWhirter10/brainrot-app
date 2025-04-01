import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
	try {
		const projectsDir = path.join(process.cwd(), 'projects');

		// Check if projects directory exists
		if (!fs.existsSync(projectsDir)) {
			fs.mkdirSync(projectsDir, { recursive: true });
			return NextResponse.json([]);
		}

		// Read all project directories
		const projectIds = fs.readdirSync(projectsDir);

		const projects = projectIds
			.map((id) => {
				try {
					const metadataPath = path.join(projectsDir, id, 'metadata.json');

					if (fs.existsSync(metadataPath)) {
						const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
						return metadata;
					}
					return null;
				} catch (error) {
					console.error(`Error reading project ${id}:`, error);
					return null;
				}
			})
			.filter(Boolean)
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

		return NextResponse.json(projects);
	} catch (error) {
		console.error('Error fetching projects:', error);
		return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
	}
}
