export enum ProjectStatus {
	INITIALIZING = 'initializing',
	INITIALIZED = 'initialized',
	INITIALIZE_ERROR = 'initialize_error',
	MERGING = 'merging',
	MERGED = 'merged',
	MERGING_ERROR = 'merging_error',
	DOWNLOADING = 'downloading',
	DOWNLOADED = 'downloaded',
	DOWNLOAD_ERROR = 'download_error',
	SEGMENTING = 'segmenting',
	SEGMENTED = 'segmented',
	SEGMENTING_ERROR = 'segmenting_error',
	CAPTIONING = 'captioning',
	CAPTIONED = 'captioned',
	CAPTIONING_ERROR = 'captioning_error',
}

export interface ProjectMetadata {
	id: string;
	createdAt: string;
	videoUrl: string;
	audioUrl: string;
	status: ProjectStatus;
	segments?: number;
	totalDuration?: number;
	currentSegment?: number;
	totalSegments?: number;
	currentProcess?: string;
	processId?: string;
	splitProcessId?: string;
	downloadProcessId?: string;
	mergeProcessId?: string;
	error?: string;
	startTime?: number;
	endTime?: number;
	audioStartTime?: number;
	audioEndTime?: number;
	splitCompletedAt?: string;
	downloadCompletedAt?: string;
	mergeCompletedAt?: string;
	progress?: { [processId: string]: number };
	captioning?: {
		captioningAttempted: boolean;
		captioningModel: string;
		captionedSegments: number[];
		failedSegments: number[];
		inProgress?: Array<{ segmentNumber: number; processId: string; startedAt: string; progress?: number }>;
	};
	cleaningStatus?: string;
}
