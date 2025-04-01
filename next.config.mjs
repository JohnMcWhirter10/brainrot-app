/** @type {import('next').NextConfig} */
const nextConfig = {
	webpack: (config) => {
		config.externals.push({
			'supports-color': 'supports-color',
		});

		// Properly ignore the projects directory to prevent recompile
		config.watchOptions = {
			...config.watchOptions,
			ignored: [
				// Use absolute path with process.cwd() for the projects directory
				`${process.cwd()}/projects/**`,
				'**/node_modules/**',
			],
		};

		return config;
	},
	experimental: {
		serverComponentsExternalPackages: ['uuid'],
	},
	// Allow serving static files from the projects directory
	async rewrites() {
		return [
			{
				source: '/projects/:projectId/:filename',
				destination: '/api/serve-file?projectId=:projectId&filename=:filename',
			},
		];
	},
};

export default nextConfig;
