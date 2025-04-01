import fs from 'fs';

/**
 * Downloads a file from a URL and saves it to the specified destination
 */
export async function downloadFile(url: string, destination: string): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download file: ${response.statusText}`);
	}

	if (!response.body) {
		throw new Error('Response body is null');
	}

	const fileStream = fs.createWriteStream(destination);

	// Create a Node.js readable stream from the response body
	const body = response.body;
	const reader = body.getReader();

	// Read the data chunk by chunk and write to the file
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		fileStream.write(value);
	}

	// Close the file stream when done
	fileStream.end();

	// Wait for the file to be fully written
	return new Promise<void>((resolve, reject) => {
		fileStream.on('finish', resolve);
		fileStream.on('error', reject);
	});
}

/**
 * Checks if a file exists at the given path
 */
export function fileExists(filePath: string): boolean {
	return fs.existsSync(filePath);
}

/**
 * Creates a directory and all parent directories if they don't exist
 */
export function ensureDirectory(dirPath: string): boolean {
	try {
		fs.mkdirSync(dirPath, { recursive: true });
		return true;
	} catch (error) {
		console.error(`Error creating directory at ${dirPath}:`, error);
		return false;
	}
}

/**
 * Validates a file path to prevent directory traversal attacks
 */
export function isValidFilePath(basePath: string, filePath: string): boolean {
	const resolvedPath = fs.realpathSync(filePath);
	return resolvedPath.startsWith(basePath);
}
