import path from 'path';

/**
 * Gets the full path to a project directory
 */
export function getProjectPath(projectId: string): string {
	return path.join(process.cwd(), 'projects', projectId);
}

/**
 * Gets the full path to a project's segments directory
 */
export function getSegmentsPath(projectId: string): string {
	return path.join(getProjectPath(projectId), 'segments');
}

/**
 * Gets the full path to a specific segment file
 */
export function getSegmentFilePath(projectId: string, segmentFilename: string): string {
	return path.join(getSegmentsPath(projectId), segmentFilename);
}

/**
 * Gets the full path to a project's temp directory
 */
export function getTempPath(projectId: string): string {
	return path.join(getProjectPath(projectId), 'temp');
}

/**
 * Gets the full path to a project's metadata file
 */
export function getMetadataFilePath(projectId: string): string {
	return path.join(getProjectPath(projectId), 'metadata.json');
}

/**
 * Gets the full path to a project's segments index file
 */
export function getSegmentsIndexPath(projectId: string): string {
	return path.join(getProjectPath(projectId), 'segments.json');
}
