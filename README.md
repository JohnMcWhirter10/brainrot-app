# BrainRot

Have you ever wanted to build brainrot content? You know, those addictive, easily-consumable short clips that flood your social media feeds? This is it. This is how it's done.

BrainRot is a web application that exposes just how simple it is to create the short-form content that dominates platforms today. With some Google searches, open-source packages, local AI models, and basic web development knowledge, anyone can churn out this type of content at scale.

This project demonstrates why short-form media doesn't provide lasting satisfaction or truly enjoyable content. It's designed to be a technical exploration and critical examination of how easily such content can be manufactured.

## What This Tool Does

BrainRot automates the process of:

-   Downloading videos from YouTube (or other supported platforms)
-   Extracting and processing both video and audio separately
-   Merging video and audio tracks into a single processed file
-   Splitting videos into easily-digestible segments (default: 60 seconds)
-   Generating accurate captions using OpenAI's Whisper
-   Applying captions with customizable styling
-   Adding AI-generated titles to video segments
-   Tracking processing status and progress in real-time
-   Streaming video content with adaptive buffering

## Requirements

### Core Dependencies

-   [Node.js](https://nodejs.org/en/) (v18 or later)
-   [npm](https://www.npmjs.com/) (v8 or later)
-   [FFmpeg](https://ffmpeg.org/) (v4.4 or later) - for video processing
-   [Python](https://www.python.org/) (v3.9 or later) - for running Whisper and yt-dlp

### External Tools

-   [yt-dlp](https://github.com/yt-dlp/yt-dlp) - for downloading videos
    -   Install with: `pip install -U yt-dlp`
-   [OpenAI Whisper](https://github.com/openai/whisper) - for speech-to-text captioning
    -   Install with: `pip install -U openai-whisper`
-   [Ollama](https://ollama.com/) (optional) - for AI-generated titles
    -   Used for generating descriptive titles for video segments

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/yourusername/brainrot-app.git
    cd brainrot-app
    ```

2. Install Node.js dependencies:

    ```bash
    npm install
    # or if using pnpm
    pnpm install
    ```

3. Install FFmpeg:

    - **macOS**: `brew install ffmpeg`
    - **Ubuntu/Debian**: `sudo apt install ffmpeg`
    - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

4. Install Python dependencies:

    ```bash
    # Install Python (if not already installed)

    # macOS
    brew install python@3.9

    # Ubuntu/Debian
    sudo apt install python3.9 python3-pip

    # Install required Python packages
    pip install -U openai-whisper yt-dlp
    ```

5. (Optional) Install Ollama for AI-generated titles:
    - Follow installation instructions at [ollama.com](https://ollama.com/)
    - Pull the llama3 model: `ollama pull llama3`

## How to Create Brainrot Content

Want to see how easy it is? Follow these steps:

1. Start the development server with pnpm:

    ```bash
    pnpm run dev
    ```

2. Open your browser and navigate to:

    ```
    http://localhost:3000
    ```

3. Gather your source materials:

    - Find a YouTube video URL with the video content you want
    - Find a YouTube video URL with the audio content you want (can be the same as video URL)
    - Determine start and end times for both video and audio (in seconds)

4. Create a new project:

    - Enter the video and audio URLs
    - Set the start and end times for the sections you want

5. Follow the processing pipeline:

    - Start the download process and wait for completion
    - Click "Merge Media" and wait for the process to complete
    - Click "Split into Segments" to divide the content
    - Generate captions for each segment

6. Between each step, you can check the `projects` directory to verify files are being created correctly:

    ```bash
    # Example path structure
    projects/[project-id]/source/       # Downloaded files
    projects/[project-id]/merge/        # Merged media
    projects/[project-id]/segments/     # Split segments
    projects/[project-id]/captions/     # Captioned videos
    ```

7. Preview and download your finished captioned segments

## UI Philosophy

The BrainRot application prioritizes functionality over aesthetics. While videos can be previewed in the UI, the interface is designed to be quick and functional rather than visually appealing. This mirrors the content it helps create – focused on rapid production rather than depth or quality. The app enables an efficient workflow for processing videos without unnecessary visual elements that might slow down the application.

## Processing Pipeline

The application follows this processing pipeline:

1. **Download**: Extract video and audio from source URLs
2. **Merge**: Combine video and audio into a processed file
3. **Split**: Divide content into manageable segments
4. **Caption**: Generate and embed captions for each segment
5. **Clean**: Remove temporary files after processing

## Application Structure

-   `app/` - Next.js application files
    -   `api/` - API routes for project management and processing
    -   `components/` - UI components
    -   `hooks/` - Custom React hooks
    -   `types/` - TypeScript type definitions
-   `components/` - Shared UI components
-   `lib/` - Utility functions and helpers
-   `projects/` - Storage directory for project files (created at runtime)

## API Routes

-   `/api/projects` - List and create projects
-   `/api/projects/[projectId]` - Get project details
-   `/api/projects/[projectId]/process/download` - Download video and audio from source URLs
-   `/api/projects/[projectId]/process/merge` - Merge video and audio tracks
-   `/api/projects/[projectId]/process/split` - Split video into segments
-   `/api/projects/[projectId]/process/caption` - Generate and add captions to segments
-   `/api/projects/[projectId]/process/clean` - Clean up temporary files
-   `/api/serve-file` - Stream video and audio files

## Support the Project

If you found this tool useful or interesting, consider buying me a coffee!

Venmo: **@JohnBrea**

## License

[MIT](LICENSE)
