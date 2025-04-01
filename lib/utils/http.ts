import { NextResponse } from 'next/server';

/**
 * Standard error response format
 */
type ErrorResponse = {
	error: string;
	details?: string | Record<string, unknown>;
	code?: string;
};

/**
 * Standard success response format
 */
type SuccessResponse<T = unknown> = {
	success: true;
	data?: T;
	message?: string;
};

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(data?: T, message?: string, status: number = 200): NextResponse {
	const response: SuccessResponse<T> = {
		success: true,
		...(data !== undefined && { data }),
		...(message && { message }),
	};

	return NextResponse.json(response, { status });
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
	error: string,
	details?: string | Record<string, unknown>,
	status: number = 500,
	code?: string
): NextResponse {
	const response: ErrorResponse = {
		error,
		...(details && { details }),
		...(code && { code }),
	};

	return NextResponse.json(response, { status });
}

/**
 * Helper for creating 400 Bad Request responses
 */
export function badRequest(message: string = 'Bad request', details?: string | Record<string, unknown>): NextResponse {
	return createErrorResponse(message, details, 400, 'BAD_REQUEST');
}

/**
 * Helper for creating 404 Not Found responses
 */
export function notFound(
	message: string = 'Resource not found',
	details?: string | Record<string, unknown>
): NextResponse {
	return createErrorResponse(message, details, 404, 'NOT_FOUND');
}

/**
 * Helper for creating 500 Internal Server Error responses
 */
export function serverError(error: Error | string, includeErrorDetails: boolean = false): NextResponse {
	const message = typeof error === 'string' ? error : 'Internal server error';
	const details = includeErrorDetails && error instanceof Error ? error.message : undefined;

	return createErrorResponse(message, details, 500, 'SERVER_ERROR');
}
